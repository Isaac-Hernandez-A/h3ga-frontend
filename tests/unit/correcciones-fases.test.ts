import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import FaseRecuperacion from '~/components/FaseRecuperacion.vue'
import FaseUnificacionNss from '~/components/FaseUnificacionNss.vue'
import { SESION_API, errorHttp, stubFetch } from './ayudas'

mockNuxtImport('navigateTo', () => vi.fn())
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

type Llamada = [string, { method: string, body?: Record<string, unknown> }]
const CLIENTE_ID = 'c1111111-1111-4111-8111-111111111111'
const CORRECCION = { id: 'cc-7', cliente_id: CLIENTE_ID, tipo_correccion_id: 7, observaciones: null, tiempo_promedio: null, dato_actual: null, dato_correcto: null }
const RUTA_NSS = `/clientes/${CLIENTE_ID}/correcciones/${CORRECCION.id}/unificacion-nss`
const DETALLE = { id: 'u1', correccion_id: CORRECCION.id, nss_principal_elegido: '12345678901', criterio_seleccion: 'antiguedad', etapa_institucional_actual: 'dictaminacion_imss' }
const SECUNDARIOS = [{ id: 's1', unificacion_id: 'u1', nss: '10987654321', observaciones: 'Duplicado de 2010' }]

async function sesion() {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  stubFetch(() => Promise.resolve({ ...SESION_API }))
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
}

describe('F3: Unificación de NSS', () => {
  function api({ detalle = DETALLE as unknown, secundarios = SECUNDARIOS as unknown[] } = {}) {
    let actual = detalle
    const lista = [...secundarios]
    return stubFetch((ruta, o) => {
      const r = ruta as string
      const { method, body } = o as Llamada[1]
      if (r === '/auth/login') return Promise.resolve({ ...SESION_API })
      if (r === RUTA_NSS && method === 'GET') return actual ? Promise.resolve(actual) : Promise.reject(errorHttp(404, { message: 'La corrección no tiene detalle de unificación de NSS.' }))
      if (r === RUTA_NSS && method === 'PUT') { actual = { ...DETALLE, ...body }; return Promise.resolve(actual) }
      if (r === `${RUTA_NSS}/secundarios` && method === 'GET') return Promise.resolve(lista.map(s => ({ ...(s as object) })))
      if (r === `${RUTA_NSS}/secundarios` && method === 'POST') { const n = { id: `s${lista.length + 1}`, unificacion_id: 'u1', observaciones: null, ...body }; lista.push(n); return Promise.resolve(n) }
      if (r === `/clientes/${CLIENTE_ID}/correcciones` && method === 'POST') return Promise.resolve({ ...CORRECCION, ...body })
      return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))
    })
  }
  async function abrir(opciones: Parameters<typeof api>[0] = {}, correccion: unknown = CORRECCION) {
    await sesion()
    const fetchMock = api(opciones)
    const wrapper = await mountSuspended(FaseUnificacionNss, { props: { clienteId: CLIENTE_ID, correccion } })
    await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando la unificación/i))
    return { wrapper, fetchMock }
  }
  const llamadas = (m: ReturnType<typeof api>) => (m.mock.calls as Llamada[]).map(([r, o]) => `${o.method} ${r}`)

  beforeEach(() => sessionStorage.clear())

  it('sin la corrección "Unificación de NSS" ofrece registrarla (POST con el tipo 7)', async () => {
    const { wrapper, fetchMock } = await abrir({}, null)
    expect(wrapper.text()).toMatch(/aún no se registra la unificación/i)
    await wrapper.find('button[data-accion="registrar-unificacion"]').trigger('click')
    await vi.waitFor(() => expect(llamadas(fetchMock)).toContain(`POST /clientes/${CLIENTE_ID}/correcciones`))
    const post = (fetchMock.mock.calls as Llamada[]).find(([, o]) => o.method === 'POST')!
    expect(post[1].body).toEqual({ tipo_correccion_id: 7 })
    expect(wrapper.emitted('correccion')?.[0]?.[0]).toMatchObject({ tipo_correccion_id: 7 })
  })

  it('muestra el detalle guardado: NSS principal, criterio y etapa institucional', async () => {
    const { wrapper } = await abrir()
    expect((wrapper.find('input[name="nss_principal_elegido"]').element as HTMLInputElement).value).toBe('12345678901')
    expect((wrapper.find('select[name="criterio_seleccion"]').element as HTMLSelectElement).value).toBe('antiguedad')
    expect((wrapper.find('select[name="etapa_institucional_actual"]').element as HTMLSelectElement).value).toBe('dictaminacion_imss')
  })

  it('los criterios y las etapas institucionales salen del contrato, con su nombre en español', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.findAll('select[name="criterio_seleccion"] option').map(o => o.attributes('value')).filter(Boolean))
      .toEqual(['vinculo_curp', 'antiguedad', 'credito_infonavit', 'estatus_pension'])
    expect(wrapper.findAll('select[name="etapa_institucional_actual"] option').map(o => o.text()).filter(t => !/elige/i.test(t)))
      .toEqual(['Ingreso y validación', 'Dictaminación IMSS', 'Migración de historial', 'Notificación CONSAR / Infonavit'])
  })

  it('guardar crea o reemplaza el detalle con PUT', async () => {
    const { wrapper, fetchMock } = await abrir()
    await wrapper.find('input[name="nss_principal_elegido"]').setValue('55555555555')
    await wrapper.find('select[name="criterio_seleccion"]').setValue('vinculo_curp')
    await wrapper.find('button[data-accion="guardar-unificacion"]').trigger('click')
    await vi.waitFor(() => expect(llamadas(fetchMock)).toContain(`PUT ${RUTA_NSS}`))
    const put = (fetchMock.mock.calls as Llamada[]).find(([, o]) => o.method === 'PUT')!
    expect(put[1].body).toEqual({ nss_principal_elegido: '55555555555', criterio_seleccion: 'vinculo_curp', etapa_institucional_actual: 'dictaminacion_imss' })
  })

  it('valida el NSS (11 dígitos) y que se elijan criterio y etapa antes de guardar', async () => {
    const { wrapper, fetchMock } = await abrir({ detalle: null, secundarios: [] })
    await wrapper.find('input[name="nss_principal_elegido"]').setValue('123')
    await wrapper.find('button[data-accion="guardar-unificacion"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toMatch(/11 dígitos/)
    expect(wrapper.text()).toMatch(/elige el criterio/i)
    expect(wrapper.text()).toMatch(/elige la etapa/i)
    expect(llamadas(fetchMock)).not.toContain(`PUT ${RUTA_NSS}`)
  })

  it('sin detalle guardado (404) muestra el formulario vacío y no ofrece NSS secundarios todavía', async () => {
    const { wrapper, fetchMock } = await abrir({ detalle: null, secundarios: [] })
    expect((wrapper.find('input[name="nss_principal_elegido"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('[data-seccion="secundarios"]').text()).toMatch(/guarda primero el NSS principal/i)
    expect(wrapper.find('button[data-accion="agregar-secundario"]').exists()).toBe(false)
    expect(llamadas(fetchMock)).not.toContain(`GET ${RUTA_NSS}/secundarios`)
  })

  it('lista los NSS secundarios y permite agregar uno (POST con nss y observaciones)', async () => {
    const { wrapper, fetchMock } = await abrir()
    const filas = () => wrapper.findAll('[data-seccion="secundarios"] [data-secundario]')
    expect(filas().map(f => f.text())).toEqual([expect.stringContaining('10987654321')])
    expect(filas()[0]!.text()).toContain('Duplicado de 2010')

    await wrapper.find('input[name="nss_secundario"]').setValue('22222222222')
    await wrapper.find('input[name="observaciones_secundario"]').setValue('Otro duplicado')
    await wrapper.find('button[data-accion="agregar-secundario"]').trigger('click')
    await vi.waitFor(() => expect(filas()).toHaveLength(2))
    const post = (fetchMock.mock.calls as Llamada[]).find(([r, o]) => r === `${RUTA_NSS}/secundarios` && o.method === 'POST')!
    expect(post[1].body).toEqual({ nss: '22222222222', observaciones: 'Otro duplicado' })
  })

  it('un NSS secundario con menos de 11 dígitos no se envía', async () => {
    const { wrapper, fetchMock } = await abrir()
    await wrapper.find('input[name="nss_secundario"]').setValue('2222')
    await wrapper.find('button[data-accion="agregar-secundario"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-seccion="secundarios"]').text()).toMatch(/11 dígitos/)
    expect(llamadas(fetchMock)).not.toContain(`POST ${RUTA_NSS}/secundarios`)
  })
})

describe('F4: Recuperación de semanas (resumen del F1)', () => {
  const D = `/clientes/${CLIENTE_ID}/diagnostico`
  const GESTIONES = [{ id: 1, nombre: 'Aclaración de semanas cotizadas ante IMSS' }, { id: 8, nombre: 'Otro' }]
  const EVIDENCIAS = [{ id: 2, nombre: 'Constancias laborales' }, { id: 8, nombre: 'Otro' }]

  function api({ analisis = { id: 'a1', diagnostico_id: 'd1', aplica: 'si', observaciones: 'Falta evidencia 2003' } as unknown, falla = false } = {}) {
    return stubFetch((ruta) => {
      const r = ruta as string
      if (r === '/auth/login') return Promise.resolve({ ...SESION_API })
      if (falla && r.startsWith(D)) return Promise.reject(errorHttp(500, { message: 'Error' }))
      if (r === `${D}/recuperacion-semanas`) return Promise.resolve(analisis)
      if (r === `${D}/recuperacion-gestiones`) return Promise.resolve([{ analisis_id: 'a1', tipo_gestion_id: 1, detalle_otro: null }, { analisis_id: 'a1', tipo_gestion_id: 8, detalle_otro: 'Carta al patrón' }])
      if (r === `${D}/recuperacion-evidencias`) return Promise.resolve([{ analisis_id: 'a1', tipo_evidencia_id: 2, detalle_otro: null }])
      if (r === '/catalogos/tipos-gestion-recuperacion') return Promise.resolve(GESTIONES)
      if (r === '/catalogos/tipos-evidencia-recuperacion') return Promise.resolve(EVIDENCIAS)
      return Promise.reject(errorHttp(404, { message: `sin simular: ${r}` }))
    })
  }
  async function abrir(opciones: Parameters<typeof api>[0] = {}) {
    await sesion()
    const fetchMock = api(opciones)
    const wrapper = await mountSuspended(FaseRecuperacion, { props: { clienteId: CLIENTE_ID } })
    await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando la recuperación/i))
    return { wrapper, fetchMock }
  }

  beforeEach(() => sessionStorage.clear())

  it('resume lo capturado en el F1: si aplica, observaciones, gestiones y evidencia', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.find('[data-aplica]').text()).toBe('Sí')
    expect(wrapper.text()).toContain('Falta evidencia 2003')
    expect(wrapper.findAll('[data-gestion]').map(g => g.text())).toEqual(['Aclaración de semanas cotizadas ante IMSS', 'Otro: Carta al patrón'])
    expect(wrapper.findAll('[data-evidencia]').map(g => g.text())).toEqual(['Constancias laborales'])
  })

  it('enlaza al diagnóstico especializado (F1) para editarlo', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.find('a[data-accion="abrir-f1"]').attributes('href')).toBe(`/clientes/${CLIENTE_ID}/f1`)
  })

  it('sin análisis capturado lo dice y sigue ofreciendo el enlace', async () => {
    const { wrapper } = await abrir({ analisis: null })
    expect(wrapper.text()).toMatch(/aún no se captura el análisis/i)
    expect(wrapper.find('a[data-accion="abrir-f1"]').exists()).toBe(true)
  })

  it('si no se puede leer el diagnóstico muestra un error con reintentar', async () => {
    const { wrapper } = await abrir({ falla: true })
    expect(wrapper.find('[role="alert"]').text()).toMatch(/no se pudo cargar la recuperación/i)
    expect(wrapper.find('button[data-accion="reintentar"]').exists()).toBe(true)
  })
})
