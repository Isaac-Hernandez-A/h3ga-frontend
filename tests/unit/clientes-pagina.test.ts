import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ClientesPage from '~/pages/clientes/index.vue'
import { useClientes } from '~/composables/useClientes'
import { formatearFechaIngreso } from '~/utils/fechas'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { AFORES, ASESOR_B, CLIENTES, LEYES, REGIMENES, USUARIOS_SUPERVISOR } from './clientes-datos'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

type Llamada = [string, { method: string, body?: Record<string, unknown> }]

function api(rol: Rol, clientes = CLIENTES) {
  const lista = clientes.map(c => ({ ...c }))
  return stubFetch((ruta, opciones) => {
    const { method, body } = opciones as Llamada[1]
    if (ruta === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
    if (ruta === '/clientes' && method === 'GET') return Promise.resolve(lista)
    if (ruta === '/usuarios') return Promise.resolve(USUARIOS_SUPERVISOR)
    if (ruta === '/avisos') return Promise.resolve([])
    if (ruta === '/catalogos/regimenes') return Promise.resolve(REGIMENES)
    if (ruta === '/catalogos/leyes-probables') return Promise.resolve(LEYES)
    if (ruta === '/catalogos/afores') return Promise.resolve(AFORES)
    if ((ruta as string).endsWith('/asesor') && method === 'PATCH') {
      const actual = lista.find(c => ruta === `/clientes/${c.id}/asesor`)!
      return Promise.resolve(Object.assign(actual, { asesor_id: body!.asesor_id }))
    }
    return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${ruta}` }))
  })
}

async function abrir(rol: Rol, clientes = CLIENTES) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  const fetchMock = api(rol, clientes)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const wrapper = await mountSuspended(ClientesPage)
  await vi.waitFor(() => expect(wrapper.findAll('[data-cliente]').length).toBeGreaterThan(0))
  return { wrapper, fetchMock }
}

const tarjetas = (wrapper: Awaited<ReturnType<typeof abrir>>['wrapper']) => wrapper.findAll('[data-cliente]')
const llamadas = (fetchMock: Awaited<ReturnType<typeof abrir>>['fetchMock']) => (fetchMock.mock.calls as Llamada[]).map(([ruta, o]) => `${o.method} ${ruta}`)
const enDocumento = (selector: string) => document.body.querySelector<HTMLElement>(selector)

describe('fechas', () => {
  it('formatearFechaIngreso muestra día, mes abreviado y año sin desfase de zona horaria', () => {
    expect(formatearFechaIngreso('2026-01-12')).toBe('12 ene 2026')
    expect(formatearFechaIngreso('2025-12-01')).toBe('1 dic 2025')
    expect(formatearFechaIngreso('2026-03-31')).toBe('31 mar 2026')
  })
})

describe('useClientes', () => {
  beforeEach(() => {
    sessionStorage.clear()
    setActivePinia(useNuxtApp().$pinia as Pinia)
  })

  it('usa las rutas de clientes y de catálogos del backend', async () => {
    const fetchMock = stubFetch(() => Promise.resolve([]))
    const clientes = useClientes()

    await clientes.listar()
    await clientes.obtener('abc')
    await clientes.crear({ nombre: 'A' } as never)
    await clientes.actualizar('abc', { nombre: 'Z' })
    await clientes.reasignar('abc', 'nuevo-asesor')
    await clientes.catalogos()

    const registro = (fetchMock.mock.calls as Llamada[]).map(([ruta, o]) => `${o.method} ${ruta} ${JSON.stringify(o.body ?? null)}`)
    expect(registro).toEqual([
      'GET /clientes null',
      'GET /clientes/abc null',
      'POST /clientes {"nombre":"A"}',
      'PATCH /clientes/abc {"nombre":"Z"}',
      'PATCH /clientes/abc/asesor {"asesor_id":"nuevo-asesor"}',
      'GET /catalogos/regimenes null',
      'GET /catalogos/leyes-probables null',
      'GET /catalogos/afores null',
    ])
  })
})

describe('Pantalla de clientes', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    document.body.innerHTML = ''
  })

  it('lista los clientes con su nombre completo y fecha de ingreso, y cuenta el total', async () => {
    const { wrapper } = await abrir('asesor')

    expect(tarjetas(wrapper)).toHaveLength(4)
    const maria = tarjetas(wrapper).find(t => t.text().includes('María Elena Rodríguez Salas'))!
    expect(maria.text()).toContain('Fecha de ingreso')
    expect(maria.text()).toContain('12 ene 2026')
    expect(wrapper.text()).toMatch(/4\s+clientes encontrados/)
    expect(wrapper.find('[data-total-clientes]').text()).toContain('4')
  })

  it('CF-14 la búsqueda filtra por nombre y por CURP, sin distinguir mayúsculas ni acentos', async () => {
    const { wrapper } = await abrir('asesor')
    const buscar = (texto: string) => wrapper.find('input[type="search"]').setValue(texto)

    await buscar('IVAN')
    expect(tarjetas(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('Iván Barrera Lozano')

    await buscar('jose angel nunez')
    expect(tarjetas(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('José Ángel Núñez Pérez')

    await buscar('rosm800315')
    expect(tarjetas(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('María Elena')

    await buscar('bali750101hdfrzv05')
    expect(tarjetas(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('Iván')

    await buscar('zzz')
    expect(tarjetas(wrapper)).toHaveLength(0)
    expect(wrapper.text()).toMatch(/no hay clientes/i)
    expect(wrapper.text()).toMatch(/0\s+clientes encontrados/)

    await buscar('')
    expect(tarjetas(wrapper)).toHaveLength(4)
  })

  it('un cliente sin CURP no rompe la búsqueda', async () => {
    const { wrapper } = await abrir('asesor')

    await wrapper.find('input[type="search"]').setValue('daniela')

    expect(tarjetas(wrapper)).toHaveLength(1)
  })

  it('el botón de alta solo aparece para el Asesor y el de reasignar solo para el Supervisor', async () => {
    const asesor = await abrir('asesor')
    expect(asesor.wrapper.find('a[data-accion="nuevo"]').exists()).toBe(true)
    expect(asesor.wrapper.find('button[data-accion="reasignar"]').exists()).toBe(false)
    asesor.wrapper.unmount()

    const supervisor = await abrir('supervisor')
    expect(supervisor.wrapper.find('a[data-accion="nuevo"]').exists()).toBe(false)
    expect(supervisor.wrapper.findAll('button[data-accion="reasignar"]')).toHaveLength(4)
    supervisor.wrapper.unmount()

    const auxiliar = await abrir('auxiliar')
    expect(auxiliar.wrapper.find('a[data-accion="nuevo"]').exists()).toBe(false)
    expect(auxiliar.wrapper.find('button[data-accion="reasignar"]').exists()).toBe(false)
  })

  it('"Nuevo cliente" lleva a /clientes/nuevo', async () => {
    const { wrapper } = await abrir('asesor')

    expect(wrapper.find('a[data-accion="nuevo"]').attributes('href')).toBe('/clientes/nuevo')
  })

  it('cada cliente enlaza a su expediente y a sus archivos', async () => {
    const { wrapper } = await abrir('asesor')
    const iván = tarjetas(wrapper).find(t => t.text().includes('Iván'))!

    expect(iván.find('a[data-accion="ver-detalles"]').attributes('href')).toBe('/clientes/c2222222-2222-4222-8222-222222222222')
    expect(iván.find('a[data-accion="ver-archivos"]').attributes('href')).toBe('/clientes/c2222222-2222-4222-8222-222222222222/archivos')
  })

  it('solo el Supervisor pide los usuarios y ve el nombre del asesor de cada cliente', async () => {
    const supervisor = await abrir('supervisor')
    await vi.waitFor(() => expect(supervisor.wrapper.text()).toContain('Carlos Montes'))
    expect(llamadas(supervisor.fetchMock)).toContain('GET /usuarios')
    const maria = tarjetas(supervisor.wrapper).find(t => t.text().includes('María Elena'))!
    expect(maria.text()).toContain('Ana Pérez')
    supervisor.wrapper.unmount()

    for (const rol of ['asesor', 'auxiliar'] as const) {
      const otro = await abrir(rol)
      expect(llamadas(otro.fetchMock), rol).not.toContain('GET /usuarios')
      expect(otro.wrapper.find('[data-asesor]').exists(), rol).toBe(false)
      otro.wrapper.unmount()
    }
  })

  it('si no se pueden leer los usuarios, el listado sigue funcionando sin los nombres de asesor', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    stubFetch((ruta) => {
      if (ruta === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol: 'supervisor' } })
      if (ruta === '/clientes') return Promise.resolve(CLIENTES)
      if (ruta === '/usuarios') return Promise.reject(errorHttp(500, { message: 'Error interno del servidor' }))
      return Promise.resolve([])
    })
    await useSessionStore().iniciarSesion('sara@h3ga.mx', 'secreta123')

    const wrapper = await mountSuspended(ClientesPage)
    await vi.waitFor(() => expect(tarjetas(wrapper)).toHaveLength(4))

    expect(wrapper.text()).not.toMatch(/no se pudieron cargar los clientes/i)
  })

  it('el Supervisor filtra por asesor, y el filtro de fecha de ingreso y "Limpiar filtros" funcionan', async () => {
    const { wrapper } = await abrir('supervisor')
    await vi.waitFor(() => expect(wrapper.find('select[name="filtro-asesor"]').exists()).toBe(true))

    await wrapper.find('select[name="filtro-asesor"]').setValue(ASESOR_B)
    expect(tarjetas(wrapper)).toHaveLength(2)
    expect(wrapper.text()).not.toContain('María Elena')

    await wrapper.find('input[name="ingreso-desde"]').setValue('2026-01-01')
    expect(tarjetas(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('Iván')

    await wrapper.find('button[data-accion="limpiar-filtros"]').trigger('click')
    expect(tarjetas(wrapper)).toHaveLength(4)
    expect((wrapper.find('input[type="search"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('input[name="ingreso-desde"]').element as HTMLInputElement).value).toBe('')
  })

  it('el Asesor y el Auxiliar no ven el filtro por asesor, pero sí el de fecha de ingreso', async () => {
    const { wrapper } = await abrir('asesor')

    expect(wrapper.find('select[name="filtro-asesor"]').exists()).toBe(false)
    await wrapper.find('input[name="ingreso-desde"]').setValue('2026-03-01')
    expect(tarjetas(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('José Ángel')
  })

  it('el Supervisor reasigna un cliente: PATCH /clientes/{id}/asesor y la tarjeta cambia de asesor', async () => {
    const { wrapper, fetchMock } = await abrir('supervisor')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Ana Pérez'))
    const maria = () => tarjetas(wrapper).find(t => t.text().includes('María Elena'))!

    await maria().find('button[data-accion="reasignar"]').trigger('click')
    await vi.waitFor(() => expect(enDocumento('select[name="nuevo-asesor"]')).not.toBeNull())
    const opciones = [...document.body.querySelectorAll<HTMLOptionElement>('select[name="nuevo-asesor"] option')].map(o => o.textContent?.trim())
    // Solo asesores activos y distintos del actual: ni el actual, ni el revocado, ni auxiliares o supervisores.
    expect(opciones.join('|')).toContain('Carlos Montes')
    expect(opciones.join('|')).toContain('Rosa Vega')
    expect(opciones.join('|')).not.toContain('Ana Pérez')
    expect(opciones.join('|')).not.toContain('Baja')
    expect(opciones.join('|')).not.toContain('Aux')
    expect(opciones.join('|')).not.toContain('Sara')

    const select = enDocumento('select[name="nuevo-asesor"]') as HTMLSelectElement
    select.value = ASESOR_B
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    enDocumento('button[data-accion="confirmar-reasignar"]')!.click()
    await flushPromises()

    const patch = (fetchMock.mock.calls as Llamada[]).find(([ruta, o]) => ruta.endsWith('/asesor') && o.method === 'PATCH')!
    expect(patch[0]).toBe('/clientes/c1111111-1111-4111-8111-111111111111/asesor')
    expect(patch[1].body).toEqual({ asesor_id: ASESOR_B })
    expect(maria().text()).toContain('Carlos Montes')
    expect(maria().text()).not.toContain('Ana Pérez')
  })

  it('reasignar no hace nada hasta elegir un asesor', async () => {
    const { wrapper, fetchMock } = await abrir('supervisor')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Ana Pérez'))

    await tarjetas(wrapper)[0]!.find('button[data-accion="reasignar"]').trigger('click')
    await vi.waitFor(() => expect(enDocumento('button[data-accion="confirmar-reasignar"]')).not.toBeNull())

    expect((enDocumento('button[data-accion="confirmar-reasignar"]') as HTMLButtonElement).disabled).toBe(true)
    expect((fetchMock.mock.calls as Llamada[]).some(([, o]) => o.method === 'PATCH')).toBe(false)
  })

  it('con 0 clientes muestra un mensaje de vacío; el Asesor puede dar de alta el primero', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    api('asesor', [])
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')

    const wrapper = await mountSuspended(ClientesPage)
    await vi.waitFor(() => expect(wrapper.text()).toMatch(/aún no hay clientes/i))

    expect(wrapper.find('a[data-accion="nuevo"]').exists()).toBe(true)
  })

  it('si la API falla muestra un error con opción de reintentar, en vez de quedarse cargando', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    stubFetch((ruta) => {
      if (ruta === '/auth/login') return Promise.resolve(SESION_API)
      return Promise.reject(errorHttp(500, { message: 'Error interno del servidor' }))
    })
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')

    const wrapper = await mountSuspended(ClientesPage)
    await vi.waitFor(() => expect(wrapper.text()).toMatch(/no se pudieron cargar los clientes/i))

    expect(wrapper.find('button[data-accion="reintentar"]').exists()).toBe(true)
    expect(wrapper.text()).not.toMatch(/cargando/i)
  })
})
