import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ExpedientePage from '~/pages/clientes/[id]/index.vue'
import { diasHasta, edadDesde, formatearFechaCorta, formatearFechaHora, textoDias } from '~/utils/fechas'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { AFORES, ASESOR_B, LEYES, REGIMENES, USUARIOS_SUPERVISOR } from './clientes-datos'
import { AVISOS, CLIENTE, DOCUMENTOS, ESTATUS, RESPUESTA_ETAPAS, enDiasISO, eventoDeOtroCliente, eventoProximo } from './expediente-datos'

const { navigateToMock, rutaMock } = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return { navigateToMock: vi.fn(), rutaMock: reactive({ params: { id: '' }, path: '', query: {}, meta: {} as Record<string, unknown> }) }
})
mockNuxtImport('navigateTo', () => navigateToMock)
mockNuxtImport('useRoute', () => () => rutaMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

interface Opciones {
  rol?: Rol
  cliente?: unknown
  fallaCliente?: number
  eventos?: unknown[]
  avisos?: unknown[]
  documentos?: unknown[]
}

function api({ rol = 'asesor', cliente = CLIENTE, fallaCliente, eventos = [eventoProximo(2), eventoDeOtroCliente()], avisos = AVISOS, documentos = DOCUMENTOS }: Opciones = {}) {
  return stubFetch((ruta) => {
    const r = ruta as string
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
    if (r === `/clientes/${CLIENTE.id}`) return fallaCliente ? Promise.reject(errorHttp(fallaCliente, { message: 'Cliente no encontrado.' })) : Promise.resolve(cliente)
    if (r === `/clientes/${CLIENTE.id}/etapas`) return Promise.resolve(RESPUESTA_ETAPAS)
    if (r === `/clientes/${CLIENTE.id}/documentos`) return Promise.resolve(documentos)
    if (r === '/catalogos/estatus') return Promise.resolve(ESTATUS)
    if (r === '/catalogos/regimenes') return Promise.resolve(REGIMENES)
    if (r === '/catalogos/leyes-probables') return Promise.resolve(LEYES)
    if (r === '/catalogos/afores') return Promise.resolve(AFORES)
    if (r === '/agenda') return Promise.resolve(eventos)
    if (r === '/avisos') return Promise.resolve(avisos)
    if (r === '/usuarios') return Promise.resolve(USUARIOS_SUPERVISOR)
    return Promise.reject(errorHttp(404, { message: `sin simular: ${r}` }))
  })
}

async function abrir(opciones: Opciones = {}) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  rutaMock.params.id = CLIENTE.id
  const fetchMock = api(opciones)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const wrapper = await mountSuspended(ExpedientePage)
  await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando el expediente/i))
  return { wrapper, fetchMock }
}
const rutas = (m: Awaited<ReturnType<typeof abrir>>['fetchMock']) => (m.mock.calls as [string][]).map(([r]) => r)

describe('fechas del expediente', () => {
  const hoy = new Date(2026, 10, 11) // 11 de noviembre de 2026, hora local

  it('edadDesde cuenta años cumplidos', () => {
    expect(edadDesde('1965-02-21', hoy)).toBe(61)
    expect(edadDesde('1965-11-11', hoy)).toBe(61)
    expect(edadDesde('1965-11-12', hoy)).toBe(60)
  })

  it('diasHasta y textoDias dan "Hoy", "Mañana", "En N días" y "Hace N días"', () => {
    expect(diasHasta('2026-11-11', hoy)).toBe(0)
    expect(diasHasta('2026-11-13', hoy)).toBe(2)
    expect(textoDias(0)).toBe('Hoy')
    expect(textoDias(1)).toBe('Mañana')
    expect(textoDias(2)).toBe('En 2 días')
    expect(textoDias(-1)).toBe('Ayer')
    expect(textoDias(-3)).toBe('Hace 3 días')
  })

  it('formatearFechaCorta y formatearFechaHora', () => {
    expect(formatearFechaCorta('2026-10-24')).toBe('24/10/2026')
    expect(formatearFechaHora(new Date(2026, 9, 21, 16, 45).toISOString())).toBe('21/10/2026 16:45')
  })
})

describe('Expediente del cliente (ver detalles)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(() => Promise.resolve()) }, configurable: true })
  })

  it('muestra el perfil con nombre, edad, contacto, objetivo y la fecha de nacimiento', async () => {
    const { wrapper } = await abrir()
    const perfil = wrapper.find('[data-perfil]')

    expect(perfil.find('[data-perfil-nombre]').text()).toBe('María Elena Rodríguez Salas')
    expect(perfil.find('[data-perfil-edad]').text()).toContain(String(edadDesde('1965-02-21')))
    expect(perfil.text()).toContain('9981234567')
    expect(perfil.text()).toContain('cliente@ejemplo.com')
    expect(perfil.text()).toContain('Calle Sur 12')
    expect(perfil.text()).toContain('21/02/1965')
    expect(perfil.find('[data-objetivo]').text()).toContain('Pensionarse lo antes posible')
    expect(perfil.find('a[href^="https://wa.me/"]').attributes('href')).toBe('https://wa.me/529981234567')
  })

  it('"Etapas actuales" lista solo las etapas en proceso, bloqueadas o detenidas, con su estatus', async () => {
    const { wrapper } = await abrir()
    const actuales = wrapper.findAll('[data-etapas-actuales] li').map(li => li.text())

    expect(actuales).toHaveLength(3)
    expect(actuales.join('|')).toContain('Diagnóstico especializado')
    expect(actuales.join('|')).toContain('En proceso asesor')
    expect(actuales.join('|')).toContain('Estrategia Modalidad 10')
    expect(actuales.join('|')).toContain('Bloqueado')
    expect(actuales.join('|')).not.toContain('Diagnóstico inicial')
  })

  it('el Asesor ve su propio nombre como asesor del cliente y no pide los usuarios; el Supervisor sí los pide y ve el nombre', async () => {
    const asesor = await abrir()
    expect(rutas(asesor.fetchMock)).not.toContain('/usuarios')
    expect(asesor.wrapper.find('[data-asesor]').text()).toContain('Ana')
    asesor.wrapper.unmount()

    const supervisor = await abrir({ rol: 'supervisor' })
    await vi.waitFor(() => expect(supervisor.wrapper.find('[data-asesor]').exists()).toBe(true))
    expect(rutas(supervisor.fetchMock)).toContain('/usuarios')
    expect(supervisor.wrapper.find('[data-asesor]').text()).toContain('Ana Pérez')
    supervisor.wrapper.unmount()

    const otro = await abrir({ rol: 'supervisor', cliente: { ...CLIENTE, asesor_id: ASESOR_B } })
    await vi.waitFor(() => expect(otro.wrapper.find('[data-asesor]').text()).toContain('Carlos Montes'))
  })

  it('el Auxiliar no ve asesor ni pide los usuarios', async () => {
    const { wrapper, fetchMock } = await abrir({ rol: 'auxiliar' })

    expect(rutas(fetchMock)).not.toContain('/usuarios')
    expect(wrapper.find('[data-asesor]').exists()).toBe(false)
  })

  it('"Datos oficiales y previsionales" muestra AFORE, NSS, CURP, RFC y demás con los nombres del catálogo, y cada dato se copia', async () => {
    const { wrapper } = await abrir({ cliente: { ...CLIENTE, nss: '12345678901', rfc: 'ROSM650221AB1' } })
    const dato = (clave: string) => wrapper.find(`[data-dato="${clave}"]`)

    expect(dato('afore').text()).toContain('Azteca')
    expect(dato('curp').text()).toContain('ROSM800315MDFDLR09')
    expect(dato('nss').text()).toContain('12345678901')
    expect(dato('rfc').text()).toContain('ROSM650221AB1')
    expect(dato('regimen').text()).toContain('IMSS')
    expect(dato('ley').text()).toContain('Ley 73')
    expect(dato('semanas').text()).toContain('500')

    await dato('curp').find('button[data-accion="copiar"]').trigger('click')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ROSM800315MDFDLR09')
  })

  it('un dato que el cliente no tiene se muestra como "Sin registrar" y no se puede copiar', async () => {
    const { wrapper } = await abrir()

    expect(wrapper.find('[data-dato="nss"]').text()).toContain('Sin registrar')
    expect(wrapper.find('[data-dato="nss"] button[data-accion="copiar"]').exists()).toBe(false)
  })

  it('la pestaña "Fechas institucionales" muestra ingreso, nacimiento, próxima cita y última actualización', async () => {
    const { wrapper } = await abrir()
    const pestana = wrapper.findAll('[data-perfil] button[role="tab"]').find(b => b.text().includes('Fechas institucionales'))!

    await pestana.trigger('click')

    const texto = wrapper.find('[data-fechas]').text()
    expect(texto).toContain('12/01/2026')
    expect(texto).toContain('21/02/1965')
    expect(texto).toContain('Cita IMSS')
    expect(texto).not.toContain('Cita de otro cliente')
  })

  it('el seguimiento muestra el avance global y una tarjeta por etapa en proceso con su avance y estatus', async () => {
    const { wrapper } = await abrir()

    expect(wrapper.find('[data-avance-global]').text()).toContain('31')
    const tarjetas = wrapper.findAll('[data-etapa-card]')
    expect(tarjetas).toHaveLength(3)
    const m10 = tarjetas.find(t => t.text().includes('Estrategia Modalidad 10'))!
    expect(m10.text()).toContain('En proceso Instituto')
    expect(m10.text()).toContain('40%')
    expect(m10.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('40')
    const bloqueada = tarjetas.find(t => t.text().includes('Estrategia Modalidad 40'))!
    expect(bloqueada.text()).toContain('Bloqueado')
    expect(bloqueada.text()).toContain('Falta la constancia de semanas')
  })

  it('la pestaña "Todas las etapas" lista las 16 con su estatus', async () => {
    const { wrapper } = await abrir()
    const pestana = wrapper.findAll('[data-seguimiento] button[role="tab"]').find(b => b.text().includes('Todas las etapas'))!

    await pestana.trigger('click')

    const filas = wrapper.findAll('[data-etapa-fila]')
    expect(filas).toHaveLength(16)
    expect(filas[0]!.text()).toContain('Finalizado')
    expect(filas[15]!.text()).toContain('Por iniciar')
  })

  it('muestra la próxima cita del cliente con los días que faltan y la última actualización de sus etapas', async () => {
    const { wrapper } = await abrir()

    const cita = wrapper.find('[data-proxima-cita]').text()
    expect(cita).toContain(formatearFechaCorta(enDiasISO(2)))
    expect(cita).toContain('En 2 días')
    expect(wrapper.find('[data-ultima-actualizacion]').text()).toContain(formatearFechaHora('2026-10-21T21:45:00.000Z'))
  })

  it('sin citas del cliente, la tarjeta de próxima cita lo dice', async () => {
    const { wrapper } = await abrir({ eventos: [eventoDeOtroCliente()] })

    expect(wrapper.find('[data-proxima-cita]').text()).toMatch(/sin citas/i)
  })

  it('las alertas incluyen los avisos pendientes de este cliente y los documentos por confirmar, y no los de otros', async () => {
    const { wrapper } = await abrir()
    const alertas = wrapper.findAll('[data-alerta]').map(a => a.text())

    expect(alertas).toHaveLength(2)
    expect(alertas.join('|')).toContain('Estrategia Modalidad 10')
    expect(alertas.join('|')).toMatch(/1 documento pendiente de confirmar/i)
  })

  it('sin alertas lo dice', async () => {
    const { wrapper } = await abrir({ avisos: [], documentos: [] })

    expect(wrapper.findAll('[data-alerta]')).toHaveLength(0)
    expect(wrapper.text()).toMatch(/sin alertas/i)
  })

  it('un fallo de agenda, avisos o documentos no impide ver el expediente', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    rutaMock.params.id = CLIENTE.id
    const base = api()
    stubFetch((ruta, opciones) => {
      if (['/agenda', '/avisos', `/clientes/${CLIENTE.id}/documentos`].includes(ruta as string)) return Promise.reject(errorHttp(500, { message: 'Error interno del servidor' }))
      return (base as unknown as (...a: unknown[]) => unknown)(ruta, opciones)
    })
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')

    const wrapper = await mountSuspended(ExpedientePage)
    await vi.waitFor(() => expect(wrapper.find('[data-perfil-nombre]').exists()).toBe(true))

    expect(wrapper.find('[data-etapa-card]').exists()).toBe(true)
  })

  it('"Ver archivos" y "Regresar" enlazan a las rutas correctas', async () => {
    const { wrapper } = await abrir()

    expect(wrapper.find('a[data-accion="ver-archivos"]').attributes('href')).toBe(`/clientes/${CLIENTE.id}/archivos`)
    expect(wrapper.find('a[data-accion="regresar"]').attributes('href')).toBe('/clientes')
  })

  it('el enlace al Diagnóstico inicial F0 lo ven el Asesor y el Supervisor, pero no el Auxiliar', async () => {
    for (const [rol, esperado] of [['asesor', true], ['supervisor', true], ['auxiliar', false]] as const) {
      const { wrapper } = await abrir({ rol })
      const enlace = wrapper.find('a[data-accion="ver-f0"]')
      expect(enlace.exists(), rol).toBe(esperado)
      if (esperado) expect(enlace.attributes('href')).toBe(`/clientes/${CLIENTE.id}/f0`)
      wrapper.unmount()
    }
  })

  it('un 404 muestra "Cliente no encontrado" con el enlace para volver', async () => {
    const { wrapper } = await abrir({ fallaCliente: 404 })

    expect(wrapper.text()).toContain('Cliente no encontrado')
    expect(wrapper.find('[data-perfil]').exists()).toBe(false)
    expect(wrapper.find('a[data-accion="regresar"]').exists()).toBe(true)
  })

  it('otro error del servidor muestra un mensaje con reintentar, en vez de quedarse cargando', async () => {
    const { wrapper } = await abrir({ fallaCliente: 500 })

    expect(wrapper.text()).toMatch(/no se pudo cargar el expediente/i)
    expect(wrapper.find('button[data-accion="reintentar"]').exists()).toBe(true)
  })
})
