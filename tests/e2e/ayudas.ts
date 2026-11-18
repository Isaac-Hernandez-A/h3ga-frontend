import { expect, type Download, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Ayudas de las pruebas de extremo a extremo. Los datos se crean por la API real (base de pruebas) con el Supervisor
// inicial, y todos son ficticios: nombres inventados y correos @ejemplo.test.
//
// Las credenciales del Supervisor NO están en el repositorio: se pasan por entorno al correr las pruebas
//   E2E_SUPERVISOR_CORREO y E2E_SUPERVISOR_CONTRASENA
// (la API se toma de NUXT_PUBLIC_API_BASE, por omisión http://localhost:3001/api/v1).

export const API = process.env.NUXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1'
export const CARPETA_CAPTURAS = join(process.cwd(), 'docs', 'capturas')
export const ROL_ID = { asesor: 1, auxiliar: 2, supervisor: 3 } as const
// Contraseña ficticia de los usuarios de prueba E2E, que solo existen en la base local de pruebas; no usar fuera de ese entorno.
export const CONTRASENA_PRUEBA ='Prueba-E2E-2026!'

export function credencialesSupervisor(): { correo: string, contrasena: string } {
  const correo = process.env.E2E_SUPERVISOR_CORREO
  const contrasena = process.env.E2E_SUPERVISOR_CONTRASENA
  if (!correo || !contrasena) {
    throw new Error('Faltan E2E_SUPERVISOR_CORREO y E2E_SUPERVISOR_CONTRASENA: son las credenciales del Supervisor inicial de la base de pruebas.')
  }
  return { correo, contrasena }
}

// ---------- API ----------
async function llamar<T>(metodo: string, ruta: string, token?: string, cuerpo?: unknown): Promise<T> {
  const esFormulario = cuerpo instanceof FormData
  const respuesta = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cuerpo !== undefined && !esFormulario ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo === undefined ? undefined : esFormulario ? cuerpo : JSON.stringify(cuerpo),
  })
  const texto = await respuesta.text()
  if (!respuesta.ok) throw new Error(`${metodo} ${ruta} respondió ${respuesta.status}: ${texto.slice(0, 300)}`)
  return (texto ? JSON.parse(texto) : undefined) as T
}

export interface Sesion { token: string, usuario: { id: string, nombre: string, rol: string } }
export async function iniciarSesionApi(correo: string, contrasena: string): Promise<Sesion> {
  const r = await llamar<{ access_token: string, usuario: Sesion['usuario'] }>('POST', '/auth/login', undefined, { correo_electronico: correo, contrasena })
  return { token: r.access_token, usuario: r.usuario }
}

export interface UsuarioPrueba { id: string, nombre: string, nombreCompleto: string, correo: string, contrasena: string, token: string }

export async function crearUsuario(tokenSupervisor: string, rol: keyof typeof ROL_ID, nombre: string, paterno: string, materno: string, sufijo: string): Promise<UsuarioPrueba> {
  const correo = `${nombre}.${paterno}.${sufijo}@ejemplo.test`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const cuerpo: Record<string, unknown> = { rol_id: ROL_ID[rol], nombre, apellido_paterno: paterno, apellido_materno: materno, correo_electronico: correo, contrasena: CONTRASENA_PRUEBA }
  if (rol === 'asesor') {
    const tipos = await llamar<{ id: number }[]>('GET', '/catalogos/tipos-asesor', tokenSupervisor)
    if (tipos[0]) cuerpo.tipo_asesor_id = tipos[0].id
  }
  const creado = await llamar<{ id: string }>('POST', '/usuarios', tokenSupervisor, cuerpo)
  const sesion = await iniciarSesionApi(correo, CONTRASENA_PRUEBA)
  return { id: creado.id, nombre, nombreCompleto: `${nombre} ${paterno} ${materno}`, correo, contrasena: CONTRASENA_PRUEBA, token: sesion.token }
}

const aleatorio = (alfabeto: string, n: number) => Array.from({ length: n }, () => alfabeto[Math.floor(Math.random() * alfabeto.length)]).join('')
// CURP ficticia con el formato oficial (no corresponde a nadie) y distinta en cada corrida.
export const curpFicticia = () => `${aleatorio('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 4)}${aleatorio('0123456789', 6)}H${aleatorio('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 2)}${aleatorio('BCDFGHJKLMNPQRSTVWXYZ', 3)}${aleatorio('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 1)}${aleatorio('0123456789', 1)}`

export interface ClientePrueba { id: string, nombre: string, nombreCompleto: string }

export async function crearCliente(tokenAsesor: string, nombre: string, paterno: string, materno: string): Promise<ClientePrueba> {
  const [regimenes, leyes, afores] = await Promise.all([
    llamar<{ id: number }[]>('GET', '/catalogos/regimenes', tokenAsesor),
    llamar<{ id: number }[]>('GET', '/catalogos/leyes-probables', tokenAsesor),
    llamar<{ id: number }[]>('GET', '/catalogos/afores', tokenAsesor),
  ])
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun' }).format(new Date())
  const c = await llamar<{ id: string }>('POST', '/clientes', tokenAsesor, {
    nombre, apellido_paterno: paterno, apellido_materno: materno, telefono: '9981234567', correo_electronico: `${nombre}.${paterno}@ejemplo.test`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ''),
    fecha_ingreso: hoy, fecha_nacimiento: '1965-02-21', sexo: 'mujer', estado_civil: 'casado', dependientes_economicos: 0, curp: curpFicticia(),
    regimen_id: regimenes[0]!.id, ley_probable_id: leyes[0]!.id, afore_id: afores[0]!.id, semanas_imss_reconocidas: 500,
    tiene_issste: 'no', cambio_afore: 'no', requiere_contadora: 'no', objetivo_cliente: 'pensionarse_asap',
    referido_por: '', observaciones_generales: '', domicilio: 'Calle Sur 12, Cancún', estado: 'Quintana Roo', subdelegacion_imss_probable: '',
  })
  return { id: c.id, nombre, nombreCompleto: `${nombre} ${paterno} ${materno}` }
}

export const autorizarAuxiliar = (tokenAsesor: string, clienteId: string, auxiliarId: string) =>
  llamar('POST', `/clientes/${clienteId}/auxiliares`, tokenAsesor, { auxiliar_id: auxiliarId })

// "AAAA-MM-DD" (zona de Cancún, la del backend) a N días de hoy.
export function fechaEnDias(n: number): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun' }).format(new Date())
  const f = new Date(`${hoy}T12:00:00`)
  f.setDate(f.getDate() + n)
  return new Intl.DateTimeFormat('en-CA').format(f)
}

// Pone un compromiso en la etapa indicada del cliente (la deja "En proceso asesor") para que genere aviso.
export async function fijarCompromiso(tokenAsesor: string, clienteId: string, numeroPaso: number, fecha: string, accion: string): Promise<void> {
  const { etapas } = await llamar<{ etapas: { id: string, numero_paso: number }[] }>('GET', `/clientes/${clienteId}/etapas`, tokenAsesor)
  const etapa = etapas.find(e => e.numero_paso === numeroPaso)!
  await llamar('PATCH', `/clientes/${clienteId}/etapas/${etapa.id}`, tokenAsesor, { estatus_id: 4, avance_porcentaje: 40, fecha_compromiso: fecha, accion_a_realizar: accion })
}

// PDF mínimo ficticio para subir como documento.
export const PDF_FICTICIO = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')

// ---------- Pantalla ----------
export async function entrar(page: Page, correo: string, contrasena: string): Promise<void> {
  await page.goto('/login')
  await page.getByPlaceholder('Ingresa tu correo').fill(correo)
  await page.getByPlaceholder('Ingresa tu contraseña').fill(contrasena)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

// Captura de pantalla para la Memoria, en docs/capturas/<nombre>.png.
export async function capturar(page: Page, nombre: string): Promise<void> {
  mkdirSync(CARPETA_CAPTURAS, { recursive: true })
  await page.waitForLoadState('networkidle')
  // El panel flotante de Nuxt DevTools (solo en desarrollo) no debe salir en las capturas.
  await page.addStyleTag({ content: '#nuxt-devtools-anchor, #nuxt-devtools-container, nuxt-devtools-frame { display: none !important }' })
  await page.screenshot({ path: join(CARPETA_CAPTURAS, `${nombre}.png`), fullPage: true })
}

// Guarda un archivo descargado en docs/capturas y devuelve su contenido.
export async function guardarDescarga(descarga: Download, nombre: string): Promise<Buffer> {
  mkdirSync(CARPETA_CAPTURAS, { recursive: true })
  const destino = join(CARPETA_CAPTURAS, nombre)
  await descarga.saveAs(destino)
  return readFileSync(destino)
}
