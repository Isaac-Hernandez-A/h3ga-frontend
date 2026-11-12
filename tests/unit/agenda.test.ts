import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import AgendaPage from '~/pages/agenda/index.vue'
import { useAgenda } from '~/composables/useAgenda'
import { formatearCita, rangoPeriodo, resumenAgenda, sumarDias } from '~/utils/agenda'
import type { EventoAgenda } from '~/types/expediente'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { CLIENTES } from './clientes-datos'
import { enDiasISO } from './expediente-datos'

mockNuxtImport('navigateTo', () => vi.fn())
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
const toastMock = vi.hoisted(() => vi.fn())
mockNuxtImport('useToast', () => () => ({ add: toastMock }))

type Llamada = [string, { method: string, body?: Record<string, unknown>, query?: Record<string, string> }]

describe('utilidades de la agenda', () => {
  const hoy = '2026-11-11' // miércoles

  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01')
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('rangoPeriodo da hoy, mañana, la semana (lunes a domingo) y el mes actual', () => {
    expect(rangoPeriodo('hoy', hoy)).toEqual({ desde: '2026-11-11', hasta: '2026-11-11' })
    expect(rangoPeriodo('manana', hoy)).toEqual({ desde: '2026-11-12', hasta: '2026-11-12' })
    expect(rangoPeriodo('semana', hoy)).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' })
    expect(rangoPeriodo('semana', '2026-11-15')).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' }) // domingo
    expect(rangoPeriodo('mes', hoy)).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' })
    expect(rangoPeriodo('mes', '2028-02-10')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' })
  })

  it('formatearCita dice Hoy, Mañana o la fecha, con la hora en 12 horas', () => {
    expect(formatearCita('2026-11-11', '13:15:00', hoy)).toBe('Hoy, 01:15 PM')
    expect(formatearCita('2026-11-12', '00:05:00', hoy)).toBe('Mañana, 12:05 AM')
    expect(formatearCita('2026-11-10', '09:00:00', hoy)).toBe('Ayer, 09:00 AM')
    expect(formatearCita('2026-11-20T00:00:00.000Z', '10:30:00', hoy)).toBe('20 nov 2026, 10:30 AM')
  })

  it('resumenAgenda cuenta citas de hoy, pendientes próximas, reagendadas y cumplidas de la semana', () => {
    const e = (fecha: string, estatus: EventoAgenda['estatus']) => ({ id: fecha + estatus, asesor_id: 'a', cliente_id: 'c', fecha, hora: '10:00:00', motivo: 'm', estatus }) as EventoAgenda
    const eventos = [e(hoy, 'pendiente'), e(hoy, 'cumplido'), e(hoy, 'cancelado'), e('2026-11-13', 'pendiente'), e('2026-11-09', 'pendiente'), e('2026-11-14', 'reagendado'), e('2026-11-02', 'cumplido')]
    expect(resumenAgenda(eventos, hoy)).toEqual({ hoy: 2, hoyPendientes: 1, pendientesProximas: 2, reagendadas: 1, cumplidasSemana: 1 })
  })
})

// Eventos relativos a hoy (la pantalla usa la fecha real).
const EV = (id: string, cliente: number, dias: number, hora: string, motivo: string, estatus: EventoAgenda['estatus']) => ({
  id: `e${id}000000-0000-4000-8000-000000000000`, asesor_id: SESION_API.usuario.id, cliente_id: CLIENTES[cliente]!.id, fecha: enDiasISO(dias), hora, motivo, estatus,
})
const EVENTOS = [
  EV('1', 0, 0, '10:00:00', 'Recibir acta de nacimiento', 'pendiente'),
  EV('2', 1, 0, '18:00:00', 'Revisar semanas', 'cumplido'),
  EV('3', 2, 1, '10:30:00', 'Entregar constancia', 'pendiente'),
  EV('4', 3, 3, '12:00:00', 'Firmar solicitud', 'reagendado'),
  EV('5', 0, -2, '09:00:00', 'Llamar al cliente', 'pendiente'),
  EV('6', 1, -1, '11:00:00', 'Cita cancelada', 'cancelado'),
  EV('7', 2, 20, '16:00:00', 'Seguimiento mensual', 'pendiente'),
]
const ID = (n: number) => `e${n}000000-0000-4000-8000-000000000000`

function api(rol: Rol = 'asesor', eventos: unknown[] = EVENTOS, clientes: unknown[] = CLIENTES) {
  const lista = eventos.map(e => ({ ...(e as object) })) as Record<string, unknown>[]
  return stubFetch((ruta, o) => {
    const r = ruta as string
    const { method, body } = o as Llamada[1]
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
    if (r === '/agenda' && method === 'GET') return Promise.resolve(lista.map(e => ({ ...e })))
    if (r === '/agenda' && method === 'POST') {
      const nuevo = { id: `n${lista.length}000000-0000-4000-8000-000000000000`, asesor_id: SESION_API.usuario.id, ...body }
      lista.push(nuevo)
      return Promise.resolve({ ...nuevo })
    }
    const uno = r.match(/^\/agenda\/([^/]+)$/)
    if (uno && method === 'PATCH') return Promise.resolve({ ...Object.assign(lista.find(e => e.id === uno[1])!, body) })
    if (r === '/clientes') return Promise.resolve(clientes)
    if (r === '/avisos') return Promise.resolve([])
    return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))
  })
}

async function abrir(rol: Rol = 'asesor', eventos: unknown[] = EVENTOS, clientes: unknown[] = CLIENTES) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  const fetchMock = api(rol, eventos, clientes)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const wrapper = await mountSuspended(AgendaPage)
  await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando la agenda/i))
  return { wrapper, fetchMock }
}
type Pagina = Awaited<ReturnType<typeof abrir>>['wrapper']
const filas = (w: Pagina) => w.findAll('[data-evento]')
const motivos = (w: Pagina) => filas(w).map(f => f.find('[data-motivo]').text())
const llamadas = (m: ReturnType<typeof api>, metodo: string, ruta: string) => (m.mock.calls as Llamada[]).filter(([r, o]) => r === ruta && o.method === metodo)
const enDocumento = (selector: string) => document.body.querySelector<HTMLElement>(selector)
const clic = async (w: Pagina, selector: string) => { await w.find(selector).trigger('click'); await flushPromises() }
const poner = async (selector: string, valor: string) => {
  const el = enDocumento(selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  el.value = valor
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  await flushPromises()
}
const guardar = async () => { enDocumento('button[data-accion="guardar-cita"]')!.click(); await flushPromises() }

describe('useAgenda', () => {
  beforeEach(() => sessionStorage.clear())

  it('usa las rutas del backend', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    stubFetch(() => Promise.resolve({ ...SESION_API }))
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const fetchMock = stubFetch(() => Promise.resolve([]))
    const agenda = useAgenda()
    await agenda.listar()
    await agenda.agendar({ cliente_id: 'c', fecha: '2026-11-12', hora: '10:00', motivo: 'm', estatus: 'pendiente' })
    await agenda.actualizar('e1', { estatus: 'cumplido' })
    expect((fetchMock.mock.calls as Llamada[]).map(([r, o]) => `${o.method} ${r} ${JSON.stringify(o.body ?? null)}`)).toEqual([
      'GET /agenda null',
      'POST /agenda {"cliente_id":"c","fecha":"2026-11-12","hora":"10:00","motivo":"m","estatus":"pendiente"}',
      'PATCH /agenda/e1 {"estatus":"cumplido"}',
    ])
  })
})

describe('Agenda de citas', () => {
  beforeEach(() => {
    sessionStorage.clear()
    toastMock.mockReset()
    document.body.innerHTML = ''
  })

  it('muestra las cuatro tarjetas de resumen', async () => {
    const { wrapper } = await abrir()
    const valor = (k: string) => wrapper.find(`[data-resumen="${k}"] [data-valor]`).text()
    expect(valor('hoy')).toBe('2') // pendiente y cumplida de hoy; la cancelada de ayer no cuenta
    expect(wrapper.find('[data-resumen="hoy"]').text()).toMatch(/1 pendiente/i)
    expect(valor('pendientes')).toBe('3') // hoy, mañana y dentro de 20 días
    expect(valor('reagendadas')).toBe('1')
    expect(valor('cumplidas')).toBe('1')
  })

  it('"Próximas" lista las citas pendientes o reagendadas de hoy en adelante, de la más cercana a la más lejana', async () => {
    const { wrapper } = await abrir()
    expect(motivos(wrapper)).toEqual(['Recibir acta de nacimiento', 'Entregar constancia', 'Firmar solicitud', 'Seguimiento mensual'])
  })

  it('cada fila muestra cliente, fecha legible, motivo y estatus', async () => {
    const { wrapper } = await abrir()
    const f = filas(wrapper)[0]!
    expect(f.find('[data-cliente]').text()).toBe('María Elena Rodríguez Salas')
    expect(f.find('[data-fecha]').text()).toBe('Hoy, 10:00 AM')
    expect(f.find('[data-estatus]').text()).toBe('Pendiente')
    expect(filas(wrapper)[1]!.find('[data-fecha]').text()).toBe('Mañana, 10:30 AM')
    expect(filas(wrapper)[2]!.find('[data-estatus]').text()).toBe('Reagendado')
  })

  it('"Pendientes" muestra todo lo sin resolver (también lo vencido) con su contador, y "Todas" las 7', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.find('[data-contador-pendientes]').text()).toBe('4')
    await clic(wrapper, 'button[data-pestana="pendientes"]')
    expect(motivos(wrapper)).toEqual(['Llamar al cliente', 'Recibir acta de nacimiento', 'Entregar constancia', 'Seguimiento mensual'])
    await clic(wrapper, 'button[data-pestana="todas"]')
    expect(filas(wrapper)).toHaveLength(7)
  })

  it('los botones de período filtran por fecha y "Limpiar filtros" los quita', async () => {
    const { wrapper } = await abrir()
    await clic(wrapper, 'button[data-pestana="todas"]')
    await clic(wrapper, 'button[data-periodo="hoy"]')
    expect(motivos(wrapper)).toEqual(['Recibir acta de nacimiento', 'Revisar semanas'])
    expect(wrapper.find('button[data-periodo="hoy"]').attributes('aria-pressed')).toBe('true')
    await clic(wrapper, 'button[data-periodo="manana"]')
    expect(motivos(wrapper)).toEqual(['Entregar constancia'])
    await clic(wrapper, 'button[data-accion="limpiar-filtros"]')
    expect(filas(wrapper)).toHaveLength(7)
  })

  it('el rango Desde/Hasta filtra por fecha', async () => {
    const { wrapper } = await abrir()
    await clic(wrapper, 'button[data-pestana="todas"]')
    await wrapper.find('input[name="desde"]').setValue(enDiasISO(2))
    expect(motivos(wrapper)).toEqual(['Firmar solicitud', 'Seguimiento mensual'])
    await wrapper.find('input[name="hasta"]').setValue(enDiasISO(5))
    expect(motivos(wrapper)).toEqual(['Firmar solicitud'])
  })

  it('busca por nombre del cliente sin distinguir acentos', async () => {
    const { wrapper } = await abrir()
    await clic(wrapper, 'button[data-pestana="todas"]')
    await wrapper.find('input[name="buscar"]').setValue('maria')
    expect(motivos(wrapper)).toEqual(['Llamar al cliente', 'Recibir acta de nacimiento'])
  })

  it('pagina las citas de 8 en 8', async () => {
    const muchas = Array.from({ length: 11 }, (_, i) => EV(String(i + 10), 0, i + 1, '10:00:00', `Cita ${i + 1}`, 'pendiente'))
    const { wrapper } = await abrir('asesor', muchas)
    expect(filas(wrapper)).toHaveLength(8)
    await clic(wrapper, 'button[data-accion="pagina-siguiente"]')
    expect(motivos(wrapper)).toEqual(['Cita 9', 'Cita 10', 'Cita 11'])
  })

  it('sin citas lo dice', async () => {
    const { wrapper } = await abrir('asesor', [])
    expect(wrapper.text()).toMatch(/no hay citas/i)
  })

  it('si falla la carga muestra un error con reintentar', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    stubFetch((ruta) => ruta === '/auth/login' ? Promise.resolve({ ...SESION_API }) : Promise.reject(errorHttp(500, { message: 'Error' })))
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const wrapper = await mountSuspended(AgendaPage)
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').text()).toMatch(/no se pudo cargar la agenda/i))
    expect(wrapper.find('button[data-accion="reintentar"]').exists()).toBe(true)
  })

  it('CF-10 el Auxiliar y el Supervisor ven la agenda sin botones de edición', async () => {
    for (const rol of ['auxiliar', 'supervisor'] as Rol[]) {
      const { wrapper } = await abrir(rol)
      expect(filas(wrapper)).toHaveLength(4)
      expect(wrapper.find('button[data-accion="nueva-cita"]').exists(), rol).toBe(false)
      expect(wrapper.find('[data-accion="cumplir"]').exists(), rol).toBe(false)
      expect(wrapper.find('[data-accion="reagendar"]').exists(), rol).toBe(false)
      expect(wrapper.find('[data-accion="cancelar"]').exists(), rol).toBe(false)
      wrapper.unmount()
    }
  })

  describe('agendar una cita', () => {
    async function abrirNueva() {
      const base = await abrir()
      await clic(base.wrapper, 'button[data-accion="nueva-cita"]')
      await vi.waitFor(() => expect(enDocumento('select[name="cliente_id"]')).not.toBeNull())
      return base
    }

    it('CF-10 el selector lista solo los clientes que devuelve la API', async () => {
      await abrirNueva()
      const opciones = [...document.body.querySelectorAll('select[name="cliente_id"] option')].map(o => o.textContent!.trim())
      expect(opciones).toEqual(['Selecciona al cliente', ...CLIENTES.map(c => [c.nombre, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' '))])
    })

    it('CF-10 exige cliente, fecha, hora y motivo', async () => {
      const { fetchMock } = await abrirNueva()
      await guardar()
      expect(document.body.textContent).toMatch(/elige al cliente/i)
      expect(document.body.textContent).toMatch(/indica la fecha/i)
      expect(document.body.textContent).toMatch(/indica la hora/i)
      expect(document.body.textContent).toMatch(/describe el motivo/i)
      expect(llamadas(fetchMock, 'POST', '/agenda')).toHaveLength(0)
    })

    it('envía POST con la cita pendiente y la agrega a la lista', async () => {
      const { wrapper, fetchMock } = await abrirNueva()
      await poner('select[name="cliente_id"]', CLIENTES[3]!.id)
      await poner('input[name="fecha"]', enDiasISO(4))
      await poner('input[name="hora"]', '15:45')
      await poner('textarea[name="motivo"]', 'Revisión de documentos para Modalidad 40')
      await guardar()

      expect(llamadas(fetchMock, 'POST', '/agenda')[0]![1].body).toEqual({ cliente_id: CLIENTES[3]!.id, fecha: enDiasISO(4), hora: '15:45', motivo: 'Revisión de documentos para Modalidad 40', estatus: 'pendiente' })
      await vi.waitFor(() => expect(enDocumento('select[name="cliente_id"]')).toBeNull())
      expect(motivos(wrapper)).toContain('Revisión de documentos para Modalidad 40')
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
    })

    it('un error del backend se muestra en la ventana y no la cierra', async () => {
      const { fetchMock } = await abrirNueva()
      const original = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation((ruta, o) => (o as Llamada[1]).method === 'POST' && ruta === '/agenda' ? Promise.reject(errorHttp(400, { message: 'La fecha u hora del evento no es válida.' })) : original(ruta, o))
      await poner('select[name="cliente_id"]', CLIENTES[0]!.id)
      await poner('input[name="fecha"]', enDiasISO(1))
      await poner('input[name="hora"]', '10:00')
      await poner('textarea[name="motivo"]', 'x')
      await guardar()
      expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('La fecha u hora del evento no es válida.')
      expect(enDocumento('select[name="cliente_id"]')).not.toBeNull()
    })
  })

  describe('cumplir, reagendar y cancelar', () => {
    const fila = (w: Pagina, motivo: string) => filas(w).find(f => f.text().includes(motivo))!

    it('"Cumplir" envía PATCH con estatus cumplido y actualiza la fila', async () => {
      const { wrapper, fetchMock } = await abrir()
      await clic(wrapper, '[data-evento] [data-accion="cumplir"]')
      expect(llamadas(fetchMock, 'PATCH', `/agenda/${ID(1)}`)[0]![1].body).toEqual({ estatus: 'cumplido' })
      // Ya no es una cita próxima: sale de la pestaña; en "Todas" aparece cumplida.
      await clic(wrapper, 'button[data-pestana="todas"]')
      expect(fila(wrapper, 'Recibir acta de nacimiento').find('[data-estatus]').text()).toBe('Cumplido')
    })

    it('"Cancelar" pide confirmación y envía PATCH con estatus cancelado', async () => {
      const { wrapper, fetchMock } = await abrir()
      await fila(wrapper, 'Entregar constancia').find('[data-accion="cancelar"]').trigger('click')
      await vi.waitFor(() => expect(enDocumento('button[data-accion="confirmar-cancelar"]')).not.toBeNull())
      expect(llamadas(fetchMock, 'PATCH', `/agenda/${ID(3)}`)).toHaveLength(0)
      enDocumento('button[data-accion="confirmar-cancelar"]')!.click()
      await flushPromises()
      expect(llamadas(fetchMock, 'PATCH', `/agenda/${ID(3)}`)[0]![1].body).toEqual({ estatus: 'cancelado' })
    })

    it('"Reagendar" abre la ventana con los datos de la cita y la marca como reagendada al cambiar fecha u hora', async () => {
      const { wrapper, fetchMock } = await abrir()
      await fila(wrapper, 'Recibir acta de nacimiento').find('[data-accion="reagendar"]').trigger('click')
      await vi.waitFor(() => expect(enDocumento('select[name="estatus"]')).not.toBeNull())
      expect((enDocumento('select[name="cliente_id"]') as HTMLSelectElement).value).toBe(CLIENTES[0]!.id)
      expect((enDocumento('input[name="fecha"]') as HTMLInputElement).value).toBe(enDiasISO(0))
      expect((enDocumento('input[name="hora"]') as HTMLInputElement).value).toBe('10:00')
      expect((enDocumento('textarea[name="motivo"]') as HTMLTextAreaElement).value).toBe('Recibir acta de nacimiento')
      expect((enDocumento('select[name="estatus"]') as HTMLSelectElement).value).toBe('pendiente')
      expect([...document.body.querySelectorAll('select[name="estatus"] option')].map(o => o.textContent!.trim())).toEqual(['Pendiente', 'Cumplido', 'Reagendado', 'Cancelado'])

      await poner('input[name="fecha"]', enDiasISO(6))
      await poner('input[name="hora"]', '11:30')
      await guardar()

      expect(llamadas(fetchMock, 'PATCH', `/agenda/${ID(1)}`)[0]![1].body).toEqual({ fecha: enDiasISO(6), hora: '11:30', estatus: 'reagendado' })
      await vi.waitFor(() => expect(enDocumento('select[name="estatus"]')).toBeNull())
      expect(fila(wrapper, 'Recibir acta de nacimiento').find('[data-estatus]').text()).toBe('Reagendado')
    })

    it('si el asesor elige un estatus a mano, se respeta aunque cambie la fecha', async () => {
      const { wrapper, fetchMock } = await abrir()
      await fila(wrapper, 'Recibir acta de nacimiento').find('[data-accion="reagendar"]').trigger('click')
      await vi.waitFor(() => expect(enDocumento('select[name="estatus"]')).not.toBeNull())
      await poner('select[name="estatus"]', 'cumplido')
      await poner('input[name="fecha"]', enDiasISO(1))
      await guardar()
      expect(llamadas(fetchMock, 'PATCH', `/agenda/${ID(1)}`)[0]![1].body).toEqual({ fecha: enDiasISO(1), estatus: 'cumplido' })
    })

    it('sin cambios no envía nada', async () => {
      const { wrapper, fetchMock } = await abrir()
      await fila(wrapper, 'Recibir acta de nacimiento').find('[data-accion="reagendar"]').trigger('click')
      await vi.waitFor(() => expect(enDocumento('select[name="estatus"]')).not.toBeNull())
      await guardar()
      expect(llamadas(fetchMock, 'PATCH', `/agenda/${ID(1)}`)).toHaveLength(0)
    })
  })
})
