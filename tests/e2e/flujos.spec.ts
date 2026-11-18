import { expect, test } from '@playwright/test'
import {
  autorizarAuxiliar, capturar, credencialesSupervisor, crearCliente, crearUsuario, entrar, fechaEnDias, fijarCompromiso, guardarDescarga,
  iniciarSesionApi, PDF_FICTICIO, type ClientePrueba, type UsuarioPrueba,
} from './ayudas'

// Casos CF-15 a CF-22 de la especificación: flujos completos por rol contra la API real (base de pruebas).
// Los datos de cada corrida se crean por la API con el Supervisor inicial y son todos ficticios.
test.describe.configure({ mode: 'serial' })

const sufijo = Date.now().toString(36)
let supervisor: { correo: string, contrasena: string, token: string }
let asesorA: UsuarioPrueba
let asesorB: UsuarioPrueba
let auxiliar: UsuarioPrueba
let clienteAutorizado: ClientePrueba
let clienteAjeno: ClientePrueba
let clienteReasignar: ClientePrueba

test.beforeAll(async () => {
  test.setTimeout(180_000)
  const { correo, contrasena } = credencialesSupervisor()
  supervisor = { correo, contrasena, token: (await iniciarSesionApi(correo, contrasena)).token }
  asesorA = await crearUsuario(supervisor.token, 'asesor', 'Laura', 'Hernández', 'Soto', sufijo)
  asesorB = await crearUsuario(supervisor.token, 'asesor', 'Carlos', 'Montes', 'Rivas', sufijo)
  auxiliar = await crearUsuario(supervisor.token, 'auxiliar', 'Marta', 'Quintal', 'Pech', sufijo)
  clienteAutorizado = await crearCliente(asesorA.token, 'José Ángel', 'Núñez', 'Pérez')
  clienteAjeno = await crearCliente(asesorA.token, 'Roberto', 'Mendoza', 'Villarreal')
  clienteReasignar = await crearCliente(asesorA.token, 'Elena', 'Castillo', 'Vega')
  await autorizarAuxiliar(asesorA.token, clienteAutorizado.id, auxiliar.id)
  // Un compromiso a 2 días en el cliente autorizado: el backend le genera su aviso (CF-21).
  await fijarCompromiso(asesorA.token, clienteAutorizado.id, 3, fechaEnDias(2), 'Entregar la constancia de semanas')
})

test('CF-15 Asesor: entra, crea un cliente, abre su expediente, cambia el estatus de una etapa y ve el historial', async ({ page }) => {
  await page.goto('/login')
  await capturar(page, '01-login')
  await entrar(page, asesorA.correo, asesorA.contrasena)

  // Crea un cliente desde el formulario.
  await page.goto('/clientes')
  await page.locator('a[data-accion="nuevo"]').click()
  await page.locator('input[name="nombre"]').fill('Ana Lucía')
  await page.locator('input[name="apellido_paterno"]').fill('Torres')
  await page.locator('input[name="apellido_materno"]').fill('Ibarra')
  await page.locator('input[name="fecha_nacimiento"]').fill('1962-07-14')
  await page.locator('select[name="sexo"]').selectOption('mujer')
  await page.locator('input[name="telefono"]').fill('9981112233')
  await page.locator('input[name="correo_electronico"]').fill(`ana.torres.${sufijo}@ejemplo.test`)
  await page.locator('input[name="fecha_ingreso"]').fill(fechaEnDias(0))
  await page.locator('select[name="regimen_id"]').selectOption({ index: 1 })
  await page.locator('select[name="ley_probable_id"]').selectOption({ index: 1 })
  await page.locator('select[name="afore_id"]').selectOption({ index: 1 })
  await page.locator('select[name="objetivo_cliente"]').selectOption('pensionarse_asap')
  await page.getByRole('button', { name: 'Registrar cliente' }).click()
  await expect(page.getByText('Cliente registrado')).toBeVisible()
  await expect(page).toHaveURL(/\/clientes$/)

  // Abre su expediente.
  await page.locator('input[type="search"]').fill('Ana Lucía')
  const tarjeta = page.locator('[data-cliente]', { hasText: 'Ana Lucía Torres Ibarra' }).first()
  await expect(tarjeta).toBeVisible()
  await capturar(page, '03-clientes')
  await tarjeta.locator('a[data-accion="ver-detalles"]').click()
  await expect(page.getByText('Ana Lucía Torres Ibarra').first()).toBeVisible()

  // Cambia el estatus de la primera etapa a "En proceso asesor".
  await page.getByRole('tab', { name: 'Todas las etapas' }).click()
  const primera = page.locator('[data-etapa-fila]').first()
  await primera.locator('button[data-accion="cambiar-estatus"]').click()
  const dialogo = page.getByRole('dialog')
  await dialogo.locator('select[name="estatus_id"]').selectOption('4')
  await dialogo.getByRole('button', { name: 'Guardar cambio' }).click()
  // exact: el aviso se dibuja dos veces (el título visible y una región de lectura de pantalla oculta con el texto
  // "Notification Estatus actualizado"); con exact solo coincide el título visible.
  await expect(page.getByText('Estatus actualizado', { exact: true })).toBeVisible()
  await expect(dialogo).toBeHidden()

  // Ve el historial de esa etapa: queda registrado el cambio.
  await primera.locator('button[data-accion="historial"]').click()
  await expect(page.getByRole('dialog').locator('[data-cambio]').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await capturar(page, '04-expediente-etapas')
})

test('CF-16 Asesor: descarga el PDF del F0 y su contenido empieza con %PDF-', async ({ page }) => {
  await entrar(page, asesorA.correo, asesorA.contrasena)
  await page.goto(`/clientes/${clienteAutorizado.id}/f0?paso=6`)
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[data-accion="descargar-f0"]').click(),
  ])
  const contenido = await guardarDescarga(descarga, '08-f0-diagnostico-inicial.pdf')
  expect(contenido.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  expect(contenido.length).toBeGreaterThan(500)
})

test('CF-17 Asesor: agenda un evento y lo reagenda', async ({ page }) => {
  const motivo = `Revisión de semanas cotizadas ${sufijo}`
  await entrar(page, asesorA.correo, asesorA.contrasena)
  await page.goto('/agenda')
  await page.locator('button[data-accion="nueva-cita"]').click()
  const dialogo = page.getByRole('dialog')
  const cliente = await dialogo.locator('select[name="cliente_id"] option', { hasText: clienteAutorizado.nombre }).first().getAttribute('value')
  await dialogo.locator('select[name="cliente_id"]').selectOption(cliente!)
  await dialogo.locator('input[name="fecha"]').fill(fechaEnDias(1))
  await dialogo.locator('input[name="hora"]').fill('10:30')
  await dialogo.locator('textarea[name="motivo"]').fill(motivo)
  await dialogo.locator('button[data-accion="guardar-cita"]').click()
  await expect(dialogo).toBeHidden()

  // La cita aparece en la lista (si la vista actual no la muestra, se abre "Todas").
  const fila = page.locator('tr[data-evento]', { hasText: motivo })
  if (await fila.count() === 0) await page.getByRole('button', { name: /^Todas/i }).click()
  await expect(fila).toBeVisible()
  await capturar(page, '05-agenda')

  // La reagenda para tres días después: queda con estatus "Reagendado".
  await fila.locator('button[data-accion="reagendar"]').click()
  const reagendar = page.getByRole('dialog')
  await reagendar.locator('input[name="fecha"]').fill(fechaEnDias(3))
  await reagendar.locator('button[data-accion="guardar-cita"]').click()
  await expect(reagendar).toBeHidden()
  await expect(page.locator('tr[data-evento]', { hasText: motivo })).toContainText(/reagendad/i)
})

test('CF-18 Auxiliar: ve solo clientes autorizados, sube un documento, ve las etapas en solo lectura y no ve Reportes ni Usuarios', async ({ page }) => {
  await entrar(page, auxiliar.correo, auxiliar.contrasena)

  // Solo ve al cliente que su asesor le autorizó.
  await page.goto('/clientes')
  await expect(page.locator('[data-cliente]')).toHaveCount(1)
  await expect(page.locator('[data-cliente]').first()).toContainText(clienteAutorizado.nombreCompleto)
  await expect(page.getByText(clienteAjeno.nombreCompleto)).toHaveCount(0)

  // Sube un documento.
  await page.goto(`/clientes/${clienteAutorizado.id}/archivos`)
  await page.locator('button[data-accion="anadir"]').click()
  const dialogo = page.getByRole('dialog')
  await dialogo.locator('select[name="tipo_documento_id"]').selectOption({ index: 1 })
  await dialogo.locator('input[name="archivo"]').setInputFiles({ name: 'Constancia ficticia E2E.pdf', mimeType: 'application/pdf', buffer: PDF_FICTICIO })
  await dialogo.locator('button[data-accion="confirmar-subir"]').click()
  await expect(page.getByText('Constancia ficticia E2E.pdf').first()).toBeVisible()

  // Las etapas están en solo lectura: sin botón de cambio de estatus.
  await page.goto(`/clientes/${clienteAutorizado.id}`)
  await page.getByRole('tab', { name: 'Todas las etapas' }).click()
  await expect(page.locator('[data-etapa-fila]')).toHaveCount(16)
  await expect(page.locator('button[data-accion="cambiar-estatus"]')).toHaveCount(0)

  // El menú no ofrece Reportes ni Usuarios.
  await expect(page.locator('nav a[href="/reportes"]')).toHaveCount(0)
  await expect(page.locator('nav a[href="/usuarios"]')).toHaveCount(0)
})

test('CF-19 Supervisor: crea y desactiva un usuario y reasigna un cliente', async ({ page }) => {
  const correo = `sofia.canul.${sufijo}@ejemplo.test`
  await entrar(page, supervisor.correo, supervisor.contrasena)

  // Crea un usuario.
  await page.goto('/usuarios')
  await page.locator('button[data-accion="nuevo"]').click()
  const dialogo = page.getByRole('dialog')
  await dialogo.locator('input[name="nombre"]').fill('Sofía')
  await dialogo.locator('input[name="apellido_paterno"]').fill('Canul')
  await dialogo.locator('input[name="apellido_materno"]').fill('Dzul')
  await dialogo.locator('input[name="correo_electronico"]').fill(correo)
  await dialogo.locator('input[name="contrasena"]').fill('Prueba-E2E-2026!')
  const rolAuxiliar = await dialogo.locator('select[name="rol_id"] option', { hasText: 'Auxiliar' }).first().getAttribute('value')
  await dialogo.locator('select[name="rol_id"]').selectOption(rolAuxiliar!)
  await dialogo.getByRole('button', { name: 'Registrar usuario' }).click()
  await expect(dialogo).toBeHidden()

  // La encuentra y la desactiva (revocar).
  await page.locator('input[type="search"]').fill(correo)
  const fila = page.locator('tr', { hasText: correo })
  await expect(fila).toBeVisible()
  await capturar(page, '02-usuarios')
  await fila.locator('button[data-accion="revocar"]').click()
  await page.getByRole('dialog').locator('[data-accion="confirmar-revocar"]').click()
  await expect(fila.locator('button[data-accion="restablecer"]')).toBeVisible()

  // Reasigna un cliente al otro asesor.
  await page.goto('/clientes')
  await page.locator('input[type="search"]').fill(clienteReasignar.nombre)
  const tarjeta = page.locator('[data-cliente]', { hasText: clienteReasignar.nombreCompleto }).first()
  await expect(tarjeta).toBeVisible()
  await tarjeta.locator('button[data-accion="reasignar"]').click()
  const reasignar = page.getByRole('dialog')
  const nuevoAsesor = await reasignar.locator('select[name="nuevo-asesor"] option', { hasText: asesorB.nombre }).first().getAttribute('value')
  await reasignar.locator('select[name="nuevo-asesor"]').selectOption(nuevoAsesor!)
  await reasignar.locator('button[data-accion="confirmar-reasignar"]').click()
  await expect(tarjeta.locator('[data-asesor]')).toContainText(asesorB.nombre)
})

test('CF-20 Supervisor: genera el reporte semanal y descarga su PDF', async ({ page }) => {
  await entrar(page, supervisor.correo, supervisor.contrasena)
  await page.goto('/reportes')
  await page.locator('select[name="periodo"]').selectOption('semanal')
  await expect(page.locator('[data-tarjeta="finalizadas"]')).toBeVisible()
  await expect(page.locator('[data-rango]')).toBeVisible()
  await capturar(page, '07-reportes')

  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[data-accion="exportar-pdf"]').click(),
  ])
  const contenido = await guardarDescarga(descarga, '09-reporte-semanal.pdf')
  expect(contenido.subarray(0, 5).toString('latin1')).toBe('%PDF-')
})

test('CF-21 aparece un aviso para un compromiso a 2 días y se atiende', async ({ page }) => {
  await entrar(page, asesorA.correo, asesorA.contrasena)
  await page.goto('/avisos')
  const aviso = page.locator('li[data-aviso]', { hasText: clienteAutorizado.nombreCompleto })
  await expect(aviso).toBeVisible()
  await capturar(page, '06-avisos')

  await aviso.click()
  await page.locator('button[data-accion="atender"]').click()
  // Atendido: sale de "Sin atender".
  await expect(page.locator('li[data-aviso]', { hasText: clienteAutorizado.nombreCompleto })).toHaveCount(0)
})

test('CF-22 una ruta sin permiso redirige; con token vencido se vuelve al login', async ({ page }) => {
  await entrar(page, asesorA.correo, asesorA.contrasena)

  // El Asesor no tiene /usuarios: va al inicio.
  await page.goto('/usuarios')
  await expect(page).not.toHaveURL(/\/usuarios/)
  await expect(page).toHaveURL(/localhost:3000\/?$/)

  // Se vence la sesión guardada: al recargar vuelve al login con el aviso.
  await page.evaluate(() => {
    const guardada = JSON.parse(sessionStorage.getItem('h3ga.sesion') ?? '{}')
    sessionStorage.setItem('h3ga.sesion', JSON.stringify({ ...guardada, expiraEn: Date.now() - 1000 }))
  })
  await page.goto('/clientes')
  await expect(page).toHaveURL(/\/login/)
})
