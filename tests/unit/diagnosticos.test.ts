import { describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import DiagnosticosPage from '~/pages/diagnosticos.vue'
import { estadoFormato } from '~/utils/diagnosticos'
import type { Cliente } from '~/types/cliente'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { CLIENTES, REGIMENES } from './clientes-datos'
import { ETAPAS } from './expediente-datos'

mockNuxtImport('navigateTo', () => vi.fn())
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

// Estatus del F0 y del F1 de cada cliente: [F0, F1]. 2 = Por iniciar, 4 = En proceso, 6 = Finalizado.
const ESTATUS_POR_CLIENTE: Record<string, [number, number]> = {
  [CLIENTES[0]!.id]: [6, 4], // capturado / pendiente
  [CLIENTES[1]!.id]: [4, 2], // pendiente / sin iniciar
  [CLIENTES[2]!.id]: [2, 2], // sin iniciar / sin iniciar
  [CLIENTES[3]!.id]: [6, 6], // capturado / capturado
}

function etapasDe(clienteId: string) {
  const [f0, f1] = ESTATUS_POR_CLIENTE[clienteId] ?? [2, 2]
  const etapas = ETAPAS.map(e => ({ ...e, cliente_id: clienteId }))
  etapas[0] = { ...etapas[0]!, estatus_id: f0 }
  etapas[1] = { ...etapas[1]!, estatus_id: f1 }
  return { avance_global: 10, etapas }
}

function api(rol: Rol, clientes: Cliente[] = CLIENTES) {
  return stubFetch((ruta, opciones) => {
    const r = ruta as string
    const { method } = opciones as { method: string }
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
    if (r === '/clientes' && method === 'GET') return Promise.resolve(clientes.map(c => ({ ...c })))
    if (r === '/catalogos/regimenes') return Promise.resolve(REGIMENES)
    if (r === '/avisos') return Promise.resolve([])
    const etapas = r.match(/^\/clientes\/([^/]+)\/etapas$/)
    if (etapas) return Promise.resolve(etapasDe(etapas[1]!))
    return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))
  })
}

async function abrir(rol: Rol = 'asesor', clientes: Cliente[] = CLIENTES) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  const fetchMock = api(rol, clientes)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const wrapper = await mountSuspended(DiagnosticosPage)
  await vi.waitFor(() => expect(wrapper.findAll('[data-diagnostico]').length).toBeGreaterThan(0))
  // La pantalla marca cuándo ya leyó las etapas de todos los clientes.
  await vi.waitFor(() => expect(wrapper.find('[data-formatos-cargados]').exists()).toBe(true))
  return { wrapper, fetchMock }
}
type Pagina = Awaited<ReturnType<typeof abrir>>['wrapper']
const filas = (w: Pagina) => w.findAll('[data-diagnostico]')
const nombres = (w: Pagina) => filas(w).map(f => f.find('[data-nombre]').text())

describe('estadoFormato', () => {
  it('traduce el estatus de la etapa a capturado, pendiente o sin iniciar', () => {
    expect(estadoFormato(6)).toBe('capturado')
    for (const id of [3, 4, 5, 7, 9]) expect(estadoFormato(id)).toBe('pendiente')
    for (const id of [1, 2, 8]) expect(estadoFormato(id)).toBe('sin_iniciar')
    expect(estadoFormato(undefined)).toBe('sin_iniciar')
  })
})

describe('pantalla Diagnósticos y expedientes', () => {
  it('muestra una fila por cliente con nombre, NSS, régimen, registro y estado de F0 y F1', async () => {
    const { wrapper } = await abrir()
    expect(filas(wrapper)).toHaveLength(4)
    const primera = filas(wrapper).find(f => f.text().includes('María Elena'))!
    expect(primera.text()).toContain('María Elena Rodríguez Salas')
    expect(primera.text()).toContain('Sin NSS')
    expect(primera.text()).toContain('IMSS')
    expect(primera.text()).toContain('12 ene 2026')
    expect(primera.find('[data-f0]').text()).toMatch(/capturado/i)
    expect(primera.find('[data-f1]').text()).toMatch(/pendiente/i)
    const jose = filas(wrapper).find(f => f.text().includes('José Ángel'))!
    expect(jose.find('[data-f0]').text()).toMatch(/sin iniciar/i)
  })

  it('pide las etapas de cada cliente para saber el estado de los formatos', async () => {
    const { fetchMock } = await abrir()
    const rutas = (fetchMock.mock.calls as [string][]).map(([r]) => r)
    for (const c of CLIENTES) expect(rutas).toContain(`/clientes/${c.id}/etapas`)
  })

  it('cuenta los expedientes con pendientes: los que tienen F0 o F1 sin capturar', async () => {
    const { wrapper } = await abrir()
    await vi.waitFor(() => expect(wrapper.find('[data-pendientes]').text()).toContain('3'))
    expect(wrapper.find('[data-pendientes]').text()).toMatch(/expedientes con pendientes/i)
  })

  it('cada fila lleva al Diagnóstico inicial F0 del cliente', async () => {
    const { wrapper } = await abrir()
    const fila = filas(wrapper).find(f => f.text().includes('María Elena'))!
    expect(fila.find('a[data-accion="abrir-f0"]').attributes('href')).toBe(`/clientes/${CLIENTES[0]!.id}/f0`)
  })

  it('el Supervisor también puede abrirlo', async () => {
    const { wrapper } = await abrir('supervisor')
    expect(filas(wrapper)).toHaveLength(4)
  })

  it('busca por nombre sin distinguir acentos ni mayúsculas', async () => {
    const { wrapper } = await abrir()
    await wrapper.find('input[name="buscar"]').setValue('ivan')
    expect(nombres(wrapper)).toEqual(['Iván Barrera Lozano'])
  })

  it('filtra por estatus del formato F0 o F1', async () => {
    const { wrapper } = await abrir()
    await wrapper.find('select[name="filtro-estatus"]').setValue('pendiente')
    // Iván (F0 pendiente) y María Elena (F1 pendiente), del más reciente al más antiguo
    expect(nombres(wrapper)).toEqual(['Iván Barrera Lozano', 'María Elena Rodríguez Salas'])
    await wrapper.find('select[name="filtro-estatus"]').setValue('capturado')
    expect(filas(wrapper)).toHaveLength(2)
    await wrapper.find('select[name="filtro-estatus"]').setValue('sin_iniciar')
    expect(nombres(wrapper)).toEqual(['José Ángel Núñez Pérez', 'Iván Barrera Lozano'])
  })

  it('filtra por régimen', async () => {
    const clientes = CLIENTES.map((c, i) => ({ ...c, regimen_id: i === 1 ? 2 : 1 }))
    const { wrapper } = await abrir('asesor', clientes)
    await wrapper.find('select[name="filtro-regimen"]').setValue('2')
    expect(nombres(wrapper)).toEqual(['Iván Barrera Lozano'])
  })

  it('ordena por registro: el más reciente primero por omisión y también el más antiguo', async () => {
    const { wrapper } = await abrir()
    expect(nombres(wrapper)[0]).toBe('José Ángel Núñez Pérez') // 20 mar 2026
    expect(nombres(wrapper).at(-1)).toBe('Daniela Cruz Palacios') // 1 dic 2025
    await wrapper.find('select[name="orden"]').setValue('antiguo')
    expect(nombres(wrapper)[0]).toBe('Daniela Cruz Palacios')
  })

  it('filtra por fecha de registro desde un día', async () => {
    const { wrapper } = await abrir()
    await wrapper.find('input[name="registro-desde"]').setValue('2026-02-01')
    expect(nombres(wrapper)).toEqual(['José Ángel Núñez Pérez', 'Iván Barrera Lozano'])
  })

  it('"Limpiar filtros" restablece búsqueda y filtros', async () => {
    const { wrapper } = await abrir()
    await wrapper.find('input[name="buscar"]').setValue('ivan')
    await wrapper.find('button[data-accion="limpiar-filtros"]').trigger('click')
    expect(filas(wrapper)).toHaveLength(4)
  })

  it('pagina de 10 en 10', async () => {
    const muchos = Array.from({ length: 23 }, (_, i) => ({
      ...CLIENTES[0]!, id: `c${String(i).padStart(7, '0')}-1111-4111-8111-111111111111`, nombre: `Cliente${String(i).padStart(2, '0')}`, fecha_ingreso: `2026-01-${String(i + 1).padStart(2, '0')}`,
    }))
    const { wrapper } = await abrir('asesor', muchos)
    expect(filas(wrapper)).toHaveLength(10)
    await wrapper.find('button[data-accion="pagina-siguiente"]').trigger('click')
    expect(nombres(wrapper)[0]).toContain('Cliente12') // el 11.º más reciente
    await wrapper.find('button[data-accion="pagina-siguiente"]').trigger('click')
    expect(filas(wrapper)).toHaveLength(3)
    expect(wrapper.find('button[data-accion="pagina-siguiente"]').attributes('disabled')).toBeDefined()
  })

  it('si no se pueden leer las etapas de un cliente, la fila sigue y los formatos quedan sin dato', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    stubFetch((ruta) => {
      const r = ruta as string
      if (r === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol: 'asesor' } })
      if (r === '/clientes') return Promise.resolve([CLIENTES[0]])
      if (r === '/catalogos/regimenes') return Promise.resolve(REGIMENES)
      if (r === '/avisos') return Promise.resolve([])
      return Promise.reject(errorHttp(500, { message: 'falló' }))
    })
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const wrapper = await mountSuspended(DiagnosticosPage)
    await vi.waitFor(() => expect(wrapper.findAll('[data-diagnostico]')).toHaveLength(1))
    await vi.waitFor(() => expect(wrapper.find('[data-f0]').text()).toBe('—'))
  })

  it('sin clientes muestra un aviso', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    api('asesor', [])
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const wrapper = await mountSuspended(DiagnosticosPage)
    await vi.waitFor(() => expect(wrapper.text()).toMatch(/aún no hay clientes/i))
  })
})
