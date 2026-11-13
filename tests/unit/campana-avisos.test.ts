import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import CampanaAvisos from '~/components/CampanaAvisos.vue'
import { agruparAvisosCampana } from '~/utils/avisos'
import { sumarDias } from '~/utils/agenda'
import { SESION_API, errorHttp, stubFetch } from './ayudas'

const { reproducirMock } = vi.hoisted(() => ({ reproducirMock: vi.fn() }))
vi.mock('~/utils/sonido', () => ({ reproducirCampana: reproducirMock }))
mockNuxtImport('navigateTo', () => vi.fn())
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

type Llamada = [string, { method: string, query?: Record<string, unknown> }]
const HORA_MS = 60 * 60 * 1000

// Fecha fija (jueves) para que "hoy" y "esta semana" no dependan del día en que se corran las pruebas.
const hoy = '2026-11-12'
const AHORA = new Date(2026, 10, 12, 10, 0)
const aviso = (n: number, fecha: string, base: Record<string, unknown> = {}) => ({
  id: `a000000${n}-0000-4000-8000-000000000000`, tipo: 'tramite', atendido: false, atendido_por: null, fecha_atencion: null, fecha_alerta: `${hoy}T06:00:00.000Z`,
  etapa_tramite_id: `et-${n}`, evento_id: null, cliente_id: `c-${n}`, cliente_nombre: `Cliente ${n}`, asesor_id: 'as', asesor_nombre: 'Ana Pérez',
  titulo: `Título ${n}`, descripcion: `Descripción ${n}`, fecha_compromiso: `${fecha}T00:00:00.000Z`, hora: null, numero_paso: 1, avance_porcentaje: 30, estatus_id: 4, ...base,
})
const finDeSemana = '2026-11-15' // domingo
const AVISOS = [
  aviso(1, sumarDias(hoy, -2)), // vencido
  aviso(2, hoy), // hoy
  aviso(3, finDeSemana), // esta semana
  aviso(4, sumarDias(finDeSemana, 3)), // la próxima semana
]

describe('agruparAvisosCampana', () => {
  it('"Hoy" trae los vencidos y los de hoy; "Esta semana" suma los que vencen hasta el domingo; ordenados por fecha', () => {
    const g = agruparAvisosCampana([AVISOS[3]!, AVISOS[2]!, AVISOS[1]!, AVISOS[0]!] as never, hoy)
    expect(g.hoy.map(a => a.titulo)).toEqual(['Título 1', 'Título 2'])
    expect(g.semana.map(a => a.titulo)).toEqual(['Título 1', 'Título 2', 'Título 3'])
  })
})

function api(avisos: unknown[] = AVISOS, falla = false) {
  const lista = avisos.map(a => ({ ...(a as object) })) as Record<string, unknown>[]
  return stubFetch((ruta, o) => {
    const r = ruta as string
    const { method, query } = (o ?? {}) as Llamada[1]
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API })
    if (r === '/avisos' && method === 'GET') {
      if (falla) return Promise.reject(errorHttp(500, { message: 'Error' }))
      return Promise.resolve(lista.filter(a => query?.atendido === undefined || a.atendido === query.atendido).map(a => ({ ...a })))
    }
    const atender = r.match(/^\/avisos\/([^/]+)\/atender$/)
    if (atender && method === 'PATCH') {
      const a = lista.find(x => x.id === atender[1])!
      a.atendido = true
      return Promise.resolve({ ...a })
    }
    return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))
  })
}

async function abrir(avisos: unknown[] = AVISOS) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  const fetchMock = api(avisos)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  usePreferenciasStore().restablecer()
  const wrapper = await mountSuspended(CampanaAvisos, { attachTo: document.body })
  await vi.waitFor(() => expect(useAvisosStore().pendientes).toBe(avisos.length))
  await flushPromises()
  return { wrapper, fetchMock }
}
type Pagina = Awaited<ReturnType<typeof abrir>>['wrapper']
const abrirPanel = async (w: Pagina) => { await w.find('button[data-campana]').trigger('click'); await flushPromises() }
const titulos = (w: Pagina) => w.findAll('[data-aviso-campana]').map(a => a.find('[data-titulo]').text())

describe('Campana de avisos del encabezado', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    reproducirMock.mockReset()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AHORA)
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('muestra cuántos avisos faltan por atender', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.find('[data-campana-contador]').text()).toBe('4')
    expect(wrapper.find('button[data-campana]').attributes('aria-label')).toMatch(/4 avisos pendientes/)
  })

  it('sin avisos pendientes no muestra contador', async () => {
    const { wrapper } = await abrir([])
    expect(wrapper.find('[data-campana-contador]').exists()).toBe(false)
  })

  it('al pulsarla abre el panel con los avisos de hoy (vencidos incluidos), y "Esta semana" agrega los de la semana', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.find('[data-panel-campana]').exists()).toBe(false)
    await abrirPanel(wrapper)
    expect(wrapper.find('[data-pestana-campana="hoy"]').attributes('aria-selected')).toBe('true')
    expect(titulos(wrapper)).toEqual(['Título 1', 'Título 2'])
    await wrapper.find('[data-pestana-campana="semana"]').trigger('click')
    expect(titulos(wrapper)).toEqual(['Título 1', 'Título 2', 'Título 3'])
  })

  it('cada aviso dice el cliente, qué compromiso es y cuánto falta (o cuánto lleva vencido)', async () => {
    const { wrapper } = await abrir()
    await abrirPanel(wrapper)
    const [vencido, deHoy] = wrapper.findAll('[data-aviso-campana]')
    expect(vencido!.text()).toContain('Cliente 1')
    expect(vencido!.find('[data-vencimiento]').text()).toMatch(/vencido hace 2 días/i)
    expect(deHoy!.find('[data-vencimiento]').text()).toBe('Vence hoy')
  })

  it('"Atender" marca el aviso con PATCH y lo quita de la campana y del contador', async () => {
    const { wrapper, fetchMock } = await abrir()
    await abrirPanel(wrapper)
    await wrapper.findAll('[data-aviso-campana]')[1]!.find('button[data-accion="atender-aviso"]').trigger('click')
    await vi.waitFor(() => expect(titulos(wrapper)).toEqual(['Título 1']))
    expect((fetchMock.mock.calls as Llamada[]).some(([r, o]) => r === `/avisos/${AVISOS[1]!.id}/atender` && o.method === 'PATCH')).toBe(true)
    expect(wrapper.find('[data-campana-contador]').text()).toBe('3')
  })

  it('"Ver todos los avisos" lleva al Centro de avisos', async () => {
    const { wrapper } = await abrir()
    await abrirPanel(wrapper)
    expect(wrapper.find('a[data-accion="ver-todos"]').attributes('href')).toBe('/avisos')
  })

  it('si no hay nada para hoy lo dice', async () => {
    const { wrapper } = await abrir([aviso(9, sumarDias(finDeSemana, 5))])
    await abrirPanel(wrapper)
    expect(wrapper.find('[data-panel-campana]').text()).toMatch(/no tienes avisos para hoy/i)
  })

  it('se cierra con Escape', async () => {
    const { wrapper } = await abrir()
    await abrirPanel(wrapper)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.find('[data-panel-campana]').exists()).toBe(false)
  })

  describe('recordatorio cada hora', () => {
    async function conRelojFalso() {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
      vi.setSystemTime(AHORA)
      return abrir()
    }

    it('cada hora, si hay avisos sin atender, la campana se mueve y suena', async () => {
      const { wrapper } = await conRelojFalso()
      expect(wrapper.find('button[data-campana]').attributes('data-moviendo')).toBe('false')
      vi.advanceTimersByTime(HORA_MS)
      await flushPromises()
      expect(wrapper.find('button[data-campana]').attributes('data-moviendo')).toBe('true')
      expect(reproducirMock).toHaveBeenCalledTimes(1)
    })

    it('no se mueve ni suena si no hay avisos pendientes', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
      vi.setSystemTime(AHORA)
      const { wrapper } = await abrir([])
      vi.advanceTimersByTime(HORA_MS)
      await flushPromises()
      expect(wrapper.find('button[data-campana]').attributes('data-moviendo')).toBe('false')
      expect(reproducirMock).not.toHaveBeenCalled()
    })

    it('respeta las preferencias: sin sonido se mueve en silencio, sin movimiento solo suena', async () => {
      const { wrapper } = await conRelojFalso()
      usePreferenciasStore().sonidoCampana = false
      vi.advanceTimersByTime(HORA_MS)
      await flushPromises()
      expect(wrapper.find('button[data-campana]').attributes('data-moviendo')).toBe('true')
      expect(reproducirMock).not.toHaveBeenCalled()

      usePreferenciasStore().sonidoCampana = true
      usePreferenciasStore().movimientoCampana = false
      await new Promise(r => setTimeout(r, 2100)) // termina el movimiento anterior
      vi.advanceTimersByTime(HORA_MS)
      await flushPromises()
      expect(wrapper.find('button[data-campana]').attributes('data-moviendo')).toBe('false')
      expect(reproducirMock).toHaveBeenCalledTimes(1)
    })

    it('al quitar la campana de la pantalla deja de avisar', async () => {
      const { wrapper } = await conRelojFalso()
      wrapper.unmount()
      vi.advanceTimersByTime(HORA_MS)
      expect(reproducirMock).not.toHaveBeenCalled()
    })
  })
})

describe('preferencias de la campana', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(useNuxtApp().$pinia as Pinia)
  })

  it('por omisión la campana suena y se mueve', () => {
    const p = usePreferenciasStore()
    p.restablecer()
    expect(p.sonidoCampana).toBe(true)
    expect(p.movimientoCampana).toBe(true)
  })

  it('se guardan en este navegador (localStorage) cuando cambian', async () => {
    const p = usePreferenciasStore()
    p.restablecer()
    p.sonidoCampana = false
    await flushPromises()
    expect(JSON.parse(localStorage.getItem('h3ga.preferencias')!)).toMatchObject({ sonidoCampana: false, movimientoCampana: true })
  })

  it('si localStorage no está disponible sigue funcionando en memoria', () => {
    const espia = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    const p = usePreferenciasStore()
    expect(() => { p.sonidoCampana = false }).not.toThrow()
    espia.mockRestore()
  })
})
