import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import AuxiliaresAutorizados from '~/components/AuxiliaresAutorizados.vue'
import { useAuxiliares } from '~/composables/useAuxiliares'
import { formatearFechaHora } from '~/utils/fechas'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { CLIENTE } from './expediente-datos'

const toastMock = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => vi.fn())
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: toastMock }))

type Llamada = [string, { method: string, body?: Record<string, unknown> }]

const AUX = (id: string, nombre: string, apellido: string, activo = true) => ({ id, nombre, apellido_paterno: apellido, apellido_materno: '', correo_electronico: `${nombre.toLowerCase()}@h3ga.mx`, activo })
const AUXILIARES = [AUX('a1111111-0000-4000-8000-000000000001', 'Laura', 'Mena'), AUX('a2222222-0000-4000-8000-000000000002', 'Pedro', 'Ruiz'), AUX('a3333333-0000-4000-8000-000000000003', 'Rosa', 'Vega'), AUX('a4444444-0000-4000-8000-000000000004', 'Baja', 'Revocada', false)]
const ASIGNACION = (id: string, auxiliarId: string, activo = true) => ({ id, cliente_id: CLIENTE.id, auxiliar_id: auxiliarId, autorizado_por: SESION_API.usuario.id, fecha_autorizacion: '2026-10-21T21:45:00.000Z', activo })
const ASIGNADAS = [ASIGNACION('x1', AUXILIARES[0]!.id), ASIGNACION('x2', AUXILIARES[1]!.id, false)]

interface Opciones { rol?: Rol, asignadas?: unknown[], candidatos?: 'ok' | 'falla', falloPost?: { status: number, cuerpo: unknown } }

function api({ rol = 'asesor', asignadas = ASIGNADAS, candidatos = 'ok', falloPost }: Opciones = {}) {
  const lista = asignadas.map(a => ({ ...(a as object) })) as Record<string, unknown>[]
  return stubFetch((ruta, o) => {
    const r = ruta as string
    const { method, body } = o as Llamada[1]
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
    if (r === `/clientes/${CLIENTE.id}/auxiliares` && method === 'GET') return Promise.resolve(lista.map(a => ({ ...a })))
    if (r === `/clientes/${CLIENTE.id}/auxiliares` && method === 'POST') {
      if (falloPost) return Promise.reject(errorHttp(falloPost.status, falloPost.cuerpo))
      const nueva = ASIGNACION(`n${lista.length}`, String(body!.auxiliar_id))
      lista.push(nueva)
      return Promise.resolve(nueva)
    }
    const una = r.match(new RegExp(`^/clientes/${CLIENTE.id}/auxiliares/([^/]+)$`))
    if (una && method === 'PATCH') return Promise.resolve(Object.assign(lista.find(a => a.id === una[1])!, body))
    if (r === '/auxiliares') return candidatos === 'ok' ? Promise.resolve(AUXILIARES) : Promise.reject(errorHttp(404, { message: 'Cannot GET /api/v1/auxiliares' }))
    return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))
  })
}

async function abrir(opciones: Opciones = {}) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  const fetchMock = api(opciones)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const wrapper = await mountSuspended(AuxiliaresAutorizados, { props: { clienteId: CLIENTE.id } })
  await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando auxiliares/i))
  return { wrapper, fetchMock }
}
type Pagina = Awaited<ReturnType<typeof abrir>>['wrapper']
const llamadas = (m: ReturnType<typeof api>, metodo: string, ruta: string) => (m.mock.calls as Llamada[]).filter(([r, o]) => r === ruta && o.method === metodo)
const filas = (w: Pagina) => w.findAll('[data-auxiliar]')
const clic = async (w: Pagina, selector: string) => { await w.find(selector).trigger('click'); await flushPromises() }

describe('useAuxiliares', () => {
  beforeEach(() => sessionStorage.clear())

  it('usa las rutas del backend', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    stubFetch(() => Promise.resolve({ ...SESION_API }))
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const fetchMock = stubFetch(() => Promise.resolve([]))
    const aux = useAuxiliares(CLIENTE.id)
    await aux.listar()
    await aux.autorizar('a1')
    await aux.cambiarActivo('x1', false)
    await aux.disponibles()
    expect((fetchMock.mock.calls as Llamada[]).map(([r, o]) => `${o.method} ${r} ${JSON.stringify(o.body ?? null)}`)).toEqual([
      `GET /clientes/${CLIENTE.id}/auxiliares null`,
      `POST /clientes/${CLIENTE.id}/auxiliares {"auxiliar_id":"a1"}`,
      `PATCH /clientes/${CLIENTE.id}/auxiliares/x1 {"activo":false}`,
      'GET /auxiliares null',
    ])
  })
})

describe('Auxiliares autorizados (expediente del cliente)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    toastMock.mockReset()
    document.body.innerHTML = ''
  })

  it('lista a los auxiliares autorizados con su nombre, correo, fecha de autorización y estado', async () => {
    const { wrapper } = await abrir()
    expect(filas(wrapper)).toHaveLength(2)
    expect(filas(wrapper)[0]!.text()).toContain('Laura Mena')
    expect(filas(wrapper)[0]!.text()).toContain('laura@h3ga.mx')
    expect(filas(wrapper)[0]!.text()).toContain(formatearFechaHora('2026-10-21T21:45:00.000Z'))
    expect(filas(wrapper)[0]!.find('[data-estado]').text()).toBe('Activo')
    expect(filas(wrapper)[1]!.find('[data-estado]').text()).toBe('Inactivo')
  })

  it('el selector ofrece solo los auxiliares activos que aún no están asignados al cliente', async () => {
    const { wrapper } = await abrir()
    const opciones = wrapper.findAll('select[name="auxiliar_id"] option').map(o => o.text())
    expect(opciones).toEqual(['Selecciona un auxiliar', 'Rosa Vega'])
  })

  it('Autorizar envía POST con el auxiliar elegido, lo agrega a la lista y avisa', async () => {
    const { wrapper, fetchMock } = await abrir()
    expect(wrapper.find('button[data-accion="autorizar-auxiliar"]').attributes('disabled')).toBeDefined()
    await wrapper.find('select[name="auxiliar_id"]').setValue(AUXILIARES[2]!.id)
    await clic(wrapper, 'button[data-accion="autorizar-auxiliar"]')

    expect(llamadas(fetchMock, 'POST', `/clientes/${CLIENTE.id}/auxiliares`)[0]![1].body).toEqual({ auxiliar_id: AUXILIARES[2]!.id })
    expect(filas(wrapper)).toHaveLength(3)
    expect(filas(wrapper)[2]!.text()).toContain('Rosa Vega')
    // Ya está asignada: desaparece del selector.
    expect(wrapper.findAll('select[name="auxiliar_id"] option').map(o => o.text())).toEqual(['Selecciona un auxiliar'])
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })

  it('Desactivar y Activar envían PATCH con el nuevo estado y actualizan la fila', async () => {
    const { wrapper, fetchMock } = await abrir()
    await clic(wrapper, '[data-auxiliar] button[data-accion="alternar-auxiliar"]')
    expect(llamadas(fetchMock, 'PATCH', `/clientes/${CLIENTE.id}/auxiliares/x1`)[0]![1].body).toEqual({ activo: false })
    expect(filas(wrapper)[0]!.find('[data-estado]').text()).toBe('Inactivo')
    expect(filas(wrapper)[0]!.find('button[data-accion="alternar-auxiliar"]').text()).toBe('Activar')

    await filas(wrapper)[1]!.find('button[data-accion="alternar-auxiliar"]').trigger('click')
    await flushPromises()
    expect(llamadas(fetchMock, 'PATCH', `/clientes/${CLIENTE.id}/auxiliares/x2`)[0]![1].body).toEqual({ activo: true })
    expect(filas(wrapper)[1]!.find('[data-estado]').text()).toBe('Activo')
  })

  it('el Supervisor ve la lista sin botones ni selector', async () => {
    const { wrapper } = await abrir({ rol: 'supervisor' })
    expect(filas(wrapper)).toHaveLength(2)
    expect(wrapper.find('button[data-accion="alternar-auxiliar"]').exists()).toBe(false)
    expect(wrapper.find('select[name="auxiliar_id"]').exists()).toBe(false)
  })

  it('sin auxiliares lo dice', async () => {
    const { wrapper } = await abrir({ asignadas: [] })
    expect(wrapper.text()).toMatch(/aún no hay auxiliares autorizados/i)
  })

  it('si no se puede leer la lista de auxiliares disponibles, avisa y la lista autorizada sigue con un nombre genérico', async () => {
    const { wrapper } = await abrir({ candidatos: 'falla' })
    expect(wrapper.text()).toMatch(/no se pudo cargar la lista de auxiliares disponibles/i)
    expect(wrapper.find('select[name="auxiliar_id"]').attributes('disabled')).toBeDefined()
    expect(filas(wrapper)).toHaveLength(2)
    expect(filas(wrapper)[0]!.text()).toContain('Auxiliar')
  })

  it('muestra el mensaje del backend si no se puede autorizar (409) y no agrega la fila', async () => {
    const { wrapper } = await abrir({ falloPost: { status: 409, cuerpo: { message: 'El auxiliar ya está asignado a este cliente.' } } })
    await wrapper.find('select[name="auxiliar_id"]').setValue(AUXILIARES[2]!.id)
    await clic(wrapper, 'button[data-accion="autorizar-auxiliar"]')
    expect(wrapper.find('[role="alert"]').text()).toMatch(/ya está asignado/i)
    expect(filas(wrapper)).toHaveLength(2)
  })
})
