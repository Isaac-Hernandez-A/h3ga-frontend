import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import AvisosPage from '~/pages/avisos/index.vue'
import AvisosBadge from '~/components/AvisosBadge.vue'
import { useAvisos } from '~/composables/useAvisos'
import { textoVencimientoAviso } from '~/utils/avisos'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { CLIENTES, USUARIOS_SUPERVISOR } from './clientes-datos'
import { enDiasISO } from './expediente-datos'

const toastMock = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => vi.fn())
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: toastMock }))

type Llamada = [string, { method: string, body?: Record<string, unknown>, query?: Record<string, unknown> }]

describe('textoVencimientoAviso', () => {
  const hoy = '2026-11-12'
  it('dice cuánto falta o cuánto lleva vencido el compromiso', () => {
    expect(textoVencimientoAviso('2026-11-12', hoy)).toBe('Vence hoy')
    expect(textoVencimientoAviso('2026-11-13', hoy)).toBe('Mañana')
    expect(textoVencimientoAviso('2026-11-16', hoy)).toBe('En 4 días')
    expect(textoVencimientoAviso('2026-11-11', hoy)).toBe('Venció ayer')
    expect(textoVencimientoAviso('2026-11-09', hoy)).toBe('Vencido hace 3 días')
  })
})

const [C1, C2, C3, C4] = CLIENTES.map(c => c.id) as [string, string, string, string]
const NOMBRES = ['Diagnóstico inicial', 'Diagnóstico especializado', 'Corrección de datos personales', 'Unificación de NSS']
function etapasDe(clienteId: string, paso: number, fecha: string, accion: string, avance: number) {
  const etapas = Array.from({ length: 16 }, (_, p) => ({
    numero_paso: p, nombre: NOMBRES[p] ?? `Etapa ${p}`, id: `${clienteId}-e${p}`, cliente_id: clienteId, etapa_id: p + 1, estatus_id: 2, avance_porcentaje: 10,
    accion_a_realizar: null, fecha_compromiso: null, fecha_completada: null, reactivado_en: null, creado_el: '2026-01-01T00:00:00.000Z', actualizado_el: '2026-11-01T00:00:00.000Z', motivo_rechazo: null,
  }))
  etapas[paso] = { ...etapas[paso]!, estatus_id: 4, avance_porcentaje: avance, fecha_compromiso: fecha, accion_a_realizar: accion }
  return { avance_global: 10, etapas }
}
const ETAPAS: Record<string, ReturnType<typeof etapasDe>> = {
  [C1]: etapasDe(C1, 1, enDiasISO(0), 'Entregar dictamen técnico firmado al cliente', 60),
  [C3]: etapasDe(C3, 2, enDiasISO(-3), 'Corregir la CURP', 30),
  [C4]: etapasDe(C4, 3, enDiasISO(4), 'Reunir los NSS', 20),
  [C2]: etapasDe(C2, 0, enDiasISO(10), 'x', 10),
}
const EVENTOS = [
  { id: 'ev000001-0000-4000-8000-000000000001', asesor_id: 'a', cliente_id: C2, fecha: enDiasISO(1), hora: '10:30:00', motivo: 'Recibir acta de nacimiento', estatus: 'pendiente' },
  { id: 'ev000002-0000-4000-8000-000000000002', asesor_id: 'a', cliente_id: C1, fecha: enDiasISO(-1), hora: '09:00:00', motivo: 'Cita ya atendida', estatus: 'pendiente' },
]
const aviso = (id: string, base: Record<string, unknown>) => ({ id: `a000000${id}-0000-4000-8000-000000000000`, atendido: false, atendido_por: null, fecha_atencion: null, fecha_alerta: '2026-11-10T06:00:00.000Z', etapa_tramite_id: null, evento_id: null, ...base })
const AVISOS = [
  aviso('1', { tipo: 'tramite', etapa_tramite_id: `${C1}-e1` }),
  aviso('2', { tipo: 'cita', evento_id: EVENTOS[0]!.id }),
  aviso('3', { tipo: 'tramite', etapa_tramite_id: `${C3}-e2` }),
  aviso('4', { tipo: 'cita', evento_id: EVENTOS[1]!.id, atendido: true, atendido_por: SESION_API.usuario.id, fecha_atencion: '2026-11-11T16:45:00.000Z' }),
  aviso('5', { tipo: 'tramite', etapa_tramite_id: `${C4}-e3` }),
]
const ID = (n: number) => `a000000${n}-0000-4000-8000-000000000000`

function api(rol: Rol = 'asesor', avisos: unknown[] = AVISOS) {
  const lista = avisos.map(a => ({ ...(a as object) })) as Record<string, unknown>[]
  return stubFetch((ruta, o) => {
    const r = ruta as string
    const { method, query } = o as Llamada[1]
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
    if (r === '/avisos' && method === 'GET') {
      const filtro = query?.atendido
      return Promise.resolve(lista.filter(a => filtro === undefined || a.atendido === filtro).map(a => ({ ...a })))
    }
    const atender = r.match(/^\/avisos\/([^/]+)\/atender$/)
    if (atender && method === 'PATCH') {
      return Promise.resolve({ ...Object.assign(lista.find(a => a.id === atender[1])!, { atendido: true, atendido_por: SESION_API.usuario.id, fecha_atencion: '2026-11-12T15:00:00.000Z' }) })
    }
    if (r === '/agenda') return Promise.resolve(EVENTOS)
    if (r === '/clientes') return Promise.resolve(CLIENTES)
    const etapas = r.match(/^\/clientes\/([^/]+)\/etapas$/)
    if (etapas) return Promise.resolve(ETAPAS[etapas[1]!])
    if (r === '/usuarios') return rol === 'supervisor' ? Promise.resolve(USUARIOS_SUPERVISOR) : Promise.reject(errorHttp(403, { message: 'No' }))
    return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))
  })
}

async function abrir(rol: Rol = 'asesor', avisos: unknown[] = AVISOS) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  const fetchMock = api(rol, avisos)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const wrapper = await mountSuspended(AvisosPage)
  await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando los avisos/i), { timeout: 4000 })
  return { wrapper, fetchMock }
}
type Pagina = Awaited<ReturnType<typeof abrir>>['wrapper']
const items = (w: Pagina) => w.findAll('[data-aviso]')
const titulos = (w: Pagina) => items(w).map(i => i.find('[data-titulo]').text())
const llamadas = (m: ReturnType<typeof api>, metodo: string, ruta: string) => (m.mock.calls as Llamada[]).filter(([r, o]) => r === ruta && o.method === metodo)
const tarjeta = (w: Pagina, k: string) => w.find(`[data-tarjeta="${k}"] [data-valor]`).text()
const clic = async (w: Pagina, selector: string) => { await w.find(selector).trigger('click'); await flushPromises() }

describe('useAvisos', () => {
  beforeEach(() => sessionStorage.clear())

  it('usa las rutas del backend', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    stubFetch(() => Promise.resolve({ ...SESION_API }))
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const fetchMock = stubFetch(() => Promise.resolve([]))
    const avisos = useAvisos()
    await avisos.listar()
    await avisos.atender('x1')
    expect((fetchMock.mock.calls as Llamada[]).map(([r, o]) => `${o.method} ${r}`)).toEqual(['GET /avisos', 'PATCH /avisos/x1/atender'])
  })
})

describe('Centro de avisos', () => {
  beforeEach(() => {
    sessionStorage.clear()
    toastMock.mockReset()
    document.body.innerHTML = ''
  })

  it('tarjetas: sin atender, trámites por vencer, compromisos vencidos y atendidos', async () => {
    const { wrapper } = await abrir()
    expect(tarjeta(wrapper, 'sin-atender')).toBe('4')
    expect(tarjeta(wrapper, 'por-vencer')).toBe('2') // trámites sin atender que aún no vencen
    expect(tarjeta(wrapper, 'vencidos')).toBe('1')
    expect(tarjeta(wrapper, 'atendidos')).toBe('1')
  })

  it('"Sin atender" lista los avisos pendientes, del compromiso más urgente al más lejano', async () => {
    const { wrapper } = await abrir()
    expect(titulos(wrapper)).toEqual(['Corrección de datos personales', 'Diagnóstico especializado', 'Cita programada', 'Unificación de NSS'])
  })

  it('cada aviso muestra tipo, fecha de alerta, cliente y cuánto falta', async () => {
    const { wrapper } = await abrir()
    const lista = items(wrapper)
    expect(lista[0]!.find('[data-tipo]').text()).toBe('Trámite')
    expect(lista[0]!.find('[data-cliente]').text()).toBe('José Ángel Núñez Pérez')
    expect(lista[0]!.find('[data-vencimiento]').text()).toBe('Vencido hace 3 días')
    expect(lista[1]!.find('[data-vencimiento]').text()).toBe('Vence hoy')
    expect(lista[2]!.find('[data-tipo]').text()).toBe('Cita')
    expect(lista[2]!.find('[data-cliente]').text()).toBe('Iván Barrera Lozano')
    expect(lista[2]!.find('[data-vencimiento]').text()).toBe('Mañana')
    expect(lista[3]!.find('[data-vencimiento]').text()).toBe('En 4 días')
    expect(lista[0]!.find('[data-fecha-alerta]').text()).toMatch(/\d{1,2} \w{3}/)
  })

  it('muestra el detalle del primer aviso y cambia al elegir otro', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.find('[data-detalle] [data-detalle-titulo]').text()).toBe('Corrección de datos personales')
    expect(items(wrapper)[0]!.attributes('aria-current')).toBe('true')
    await items(wrapper)[1]!.trigger('click')
    expect(wrapper.find('[data-detalle] [data-detalle-titulo]').text()).toBe('Diagnóstico especializado')
    expect(items(wrapper)[1]!.attributes('aria-current')).toBe('true')
  })

  it('detalle de un trámite: acción pendiente, cliente, fecha compromiso, etapa de origen, estado y avance', async () => {
    const { wrapper } = await abrir()
    await items(wrapper)[1]!.trigger('click')
    const d = wrapper.find('[data-detalle]')
    expect(d.find('[data-detalle-descripcion]').text()).toBe('Entregar dictamen técnico firmado al cliente')
    expect(d.find('[data-dato="cliente"]').text()).toContain('María Elena Rodríguez Salas')
    expect(d.find('[data-dato="origen"]').text()).toContain('Diagnóstico especializado')
    expect(d.find('[data-dato="estado"]').text()).toContain('No atendido')
    expect(d.find('[data-avance]').text()).toContain('60%')
    expect(d.find('a[data-accion="ver-expediente"]').attributes('href')).toBe(`/clientes/${C1}`)
  })

  it('detalle de una cita: motivo, fecha con hora y origen en la agenda, sin avance de etapa', async () => {
    const { wrapper } = await abrir()
    await items(wrapper)[2]!.trigger('click')
    const d = wrapper.find('[data-detalle]')
    expect(d.find('[data-detalle-titulo]').text()).toBe('Cita programada')
    expect(d.find('[data-detalle-descripcion]').text()).toBe('Recibir acta de nacimiento')
    expect(d.find('[data-dato="fecha"]').text()).toContain('10:30 AM')
    expect(d.find('[data-dato="origen"]').text()).toContain('Agenda de citas')
    expect(d.find('[data-avance]').exists()).toBe(false)
  })

  it('"Atendidos" y "Todos" cambian la lista; un aviso atendido muestra cuándo y no ofrece atender', async () => {
    const { wrapper } = await abrir()
    await clic(wrapper, 'button[data-pestana="atendidos"]')
    expect(titulos(wrapper)).toEqual(['Cita programada'])
    expect(wrapper.find('[data-detalle] [data-dato="estado"]').text()).toMatch(/atendido el/i)
    expect(wrapper.find('button[data-accion="atender"]').exists()).toBe(false)
    await clic(wrapper, 'button[data-pestana="todos"]')
    expect(items(wrapper)).toHaveLength(5)
  })

  it('filtra por tipo (Trámite o Cita) y busca por nombre del cliente sin distinguir acentos', async () => {
    const { wrapper } = await abrir()
    await wrapper.find('select[name="tipo"]').setValue('cita')
    expect(titulos(wrapper)).toEqual(['Cita programada'])
    await wrapper.find('select[name="tipo"]').setValue('')
    await wrapper.find('input[name="buscar"]').setValue('jose angel')
    expect(titulos(wrapper)).toEqual(['Corrección de datos personales'])
  })

  it('"Marcar como atendido" llama a PATCH /avisos/{id}/atender y lo mueve a atendidos', async () => {
    const { wrapper, fetchMock } = await abrir()
    await clic(wrapper, 'button[data-accion="atender"]') // el primero: el trámite vencido
    expect(llamadas(fetchMock, 'PATCH', `/avisos/${ID(3)}/atender`)).toHaveLength(1)
    expect(titulos(wrapper)).toEqual(['Diagnóstico especializado', 'Cita programada', 'Unificación de NSS'])
    expect(wrapper.find('[data-detalle] [data-detalle-titulo]').text()).toBe('Diagnóstico especializado') // pasa al siguiente
    expect(tarjeta(wrapper, 'sin-atender')).toBe('3')
    expect(tarjeta(wrapper, 'atendidos')).toBe('2')
    await clic(wrapper, 'button[data-pestana="atendidos"]')
    expect(titulos(wrapper)).toContain('Corrección de datos personales')
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })

  it('CF-11 el contador del menú refleja los pendientes y baja al atender uno', async () => {
    const { wrapper } = await abrir()
    const insignia = await mountSuspended(AvisosBadge)
    await flushPromises()
    expect(insignia.text()).toBe('4')
    await clic(wrapper, 'button[data-accion="atender"]')
    await vi.waitFor(() => expect(insignia.text()).toBe('3'))
  })

  it('si no se puede atender muestra el error y el aviso sigue pendiente', async () => {
    const { wrapper, fetchMock } = await abrir()
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((ruta, o) => (o as Llamada[1]).method === 'PATCH' ? Promise.reject(errorHttp(404, { message: 'Aviso no encontrado.' })) : original(ruta, o))
    await clic(wrapper, 'button[data-accion="atender"]')
    expect(wrapper.find('[role="alert"]').text()).toContain('Aviso no encontrado.')
    expect(tarjeta(wrapper, 'sin-atender')).toBe('4')
  })

  it('cada rol atiende sus avisos: el Auxiliar y el Supervisor también ven el botón', async () => {
    for (const rol of ['auxiliar', 'supervisor'] as Rol[]) {
      const { wrapper } = await abrir(rol)
      expect(items(wrapper), rol).toHaveLength(4)
      expect(wrapper.find('button[data-accion="atender"]').exists(), rol).toBe(true)
      wrapper.unmount()
    }
  })

  it('el Supervisor ve el asesor del cliente; el Auxiliar no (no puede leer los usuarios)', async () => {
    const sup = await abrir('supervisor')
    // El primer aviso es de José Ángel Núñez (asesor A: Ana Pérez)
    expect(sup.wrapper.find('[data-detalle] [data-asesor]').text()).toContain('Ana Pérez')
    sup.wrapper.unmount()
    const aux = await abrir('auxiliar')
    expect(aux.wrapper.find('[data-detalle] [data-asesor]').exists()).toBe(false)
  })

  it('sin avisos lo dice', async () => {
    const { wrapper } = await abrir('asesor', [])
    expect(wrapper.text()).toMatch(/no hay avisos/i)
  })

  it('si falla la carga muestra un error con reintentar', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    stubFetch(ruta => ruta === '/auth/login' ? Promise.resolve({ ...SESION_API }) : Promise.reject(errorHttp(500, { message: 'Error' })))
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const wrapper = await mountSuspended(AvisosPage)
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').text()).toMatch(/no se pudieron cargar los avisos/i))
    expect(wrapper.find('button[data-accion="reintentar"]').exists()).toBe(true)
  })
})
