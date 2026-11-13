import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import DetallePage from '~/pages/correcciones/[id].vue'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { AFORES, LEYES, REGIMENES } from './clientes-datos'
import { CLIENTE, DOCUMENTOS, ESTATUS, ETAPAS, TIPOS_DOCUMENTO } from './expediente-datos'

const { navigateToMock, rutaMock } = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return { navigateToMock: vi.fn(), rutaMock: reactive({ params: { id: '' }, path: '', query: {}, meta: {} as Record<string, unknown> }) }
})
mockNuxtImport('navigateTo', () => navigateToMock)
mockNuxtImport('useRoute', () => () => rutaMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch() (también su variante .raw).
mockNuxtImport('$fetch', () => {
  const g = globalThis as unknown as { $fetch: ((...a: unknown[]) => unknown) & { raw: (...a: unknown[]) => unknown } }
  return Object.assign((...args: unknown[]) => g.$fetch(...args), { raw: (...args: unknown[]) => g.$fetch.raw(...args) })
})
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

type Llamada = [string, { method: string, body?: unknown }]

// Tipos de documento nuevos del backend para F3 y F4.
const TIPO_CERTIFICACION = { id: 15, nombre: 'Certificación de regularización y/o corrección de datos personales del asegurado (IMSS)' }
const TIPO_CONSTANCIA = { id: 16, nombre: 'Constancia de Aclaración de Semanas Cotizadas (IMSS)' }
const TIPO_REINTEGRO = { id: 17, nombre: 'Solicitud de Reintegro de Recursos (AFORE)' }
const TIPOS = [...TIPOS_DOCUMENTO, TIPO_CERTIFICACION, TIPO_CONSTANCIA, TIPO_REINTEGRO]
const DOC_CERTIFICACION = { ...DOCUMENTOS[0]!, id: 'd1500000-0000-4000-8000-000000000015', tipo_documento_id: 15, nombre_archivo_original: 'Certificación IMSS.pdf', fecha_carga: '2026-11-05T15:00:00.000Z' }

const CORRECCION_CURP = { id: 'cc-1', cliente_id: CLIENTE.id, tipo_correccion_id: 1, observaciones: 'CURP mal capturada', tiempo_promedio: '10 días', dato_actual: 'ROSM650221MDFDLR00', dato_correcto: 'ROSM650221MQRDLR09' }
const CORRECCION_SINDO = { id: 'cc-9', cliente_id: CLIENTE.id, tipo_correccion_id: 9, observaciones: 'Actualizar en SINDO', tiempo_promedio: null, dato_actual: null, dato_correcto: null }
const CORRECCION_NSS = { id: 'cc-7', cliente_id: CLIENTE.id, tipo_correccion_id: 7, observaciones: null, tiempo_promedio: null, dato_actual: null, dato_correcto: null }
const TIPOS_CORRECCION = [
  { id: 1, nombre: 'Corrección de CURP' }, { id: 3, nombre: 'Corrección de Acta de Nacimiento' }, { id: 7, nombre: 'Unificación de NSS (Duplicidad / Multiplicidad)' },
  { id: 9, nombre: 'Regularización / Actualización de Datos ante IMSS (SINDO)' }, { id: 12, nombre: 'Otro' },
]
const RUTA_NSS = `/clientes/${CLIENTE.id}/correcciones/${CORRECCION_NSS.id}/unificacion-nss`
const D = `/clientes/${CLIENTE.id}/diagnostico`

interface Opciones { correcciones?: unknown[], documentos?: unknown[], aplica?: string | null, fallaCliente?: number, fallaQuitar?: boolean }

function api(opciones: Opciones = {}) {
  const { correcciones = [CORRECCION_CURP, CORRECCION_SINDO, CORRECCION_NSS], documentos = [...DOCUMENTOS, DOC_CERTIFICACION], aplica = 'si', fallaCliente } = opciones
  const lista = correcciones.map(c => ({ ...(c as object) }))
  const docs = documentos.map(d => ({ ...(d as object) }))
  return stubFetch((ruta, o) => {
    const r = ruta as string
    const { method, body } = (o ?? {}) as Llamada[1]
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API })
    if (r === `/clientes/${CLIENTE.id}`) return fallaCliente ? Promise.reject(errorHttp(fallaCliente, { message: 'Cliente no encontrado.' })) : Promise.resolve(CLIENTE)
    if (r === `/clientes/${CLIENTE.id}/etapas`) return Promise.resolve(JSON.parse(JSON.stringify({ avance_global: 40, etapas: ETAPAS.map(e => (e.numero_paso === 2 ? { ...e, estatus_id: 4 } : e.numero_paso === 3 ? { ...e, estatus_id: 6 } : e)) })))
    if (r === `/clientes/${CLIENTE.id}/documentos` && method === 'GET') return Promise.resolve(docs.map(d => ({ ...d })))
    if (r === `/clientes/${CLIENTE.id}/documentos` && method === 'POST') return Promise.resolve({ ...DOC_CERTIFICACION, id: 'd9999999-0000-4000-8000-000000000009', nombre_archivo_original: 'nuevo.pdf' })
    if (r === `/clientes/${CLIENTE.id}/correcciones` && method === 'GET') return Promise.resolve(lista.map(c => ({ ...c })))
    if (r === `/clientes/${CLIENTE.id}/correcciones` && method === 'POST') return Promise.resolve({ id: 'cc-nuevo', cliente_id: CLIENTE.id, observaciones: null, tiempo_promedio: null, dato_actual: null, dato_correcto: null, ...(body as object) })
    const parche = r.match(/^\/clientes\/[^/]+\/correcciones\/([^/]+)$/)
    if (parche && method === 'DELETE') return opciones.fallaQuitar ? Promise.reject(errorHttp(404, { message: 'La corrección no existe.' })) : Promise.resolve(undefined)
    if (parche && method === 'PATCH') return Promise.resolve({ ...lista.find(c => (c as { id: string }).id === parche[1]), ...(body as object) })
    if (r === RUTA_NSS) return Promise.resolve({ id: 'u1', correccion_id: CORRECCION_NSS.id, nss_principal_elegido: '12345678901', criterio_seleccion: 'antiguedad', etapa_institucional_actual: 'ingreso_validacion' })
    if (r === `${RUTA_NSS}/secundarios`) return Promise.resolve([])
    if (r === `${D}/recuperacion-semanas`) return Promise.resolve(aplica === null ? undefined : { id: 'a1', diagnostico_id: 'd1', aplica, observaciones: 'Falta evidencia 2003' })
    if (r.startsWith(`${D}/recuperacion-`)) return Promise.resolve([])
    if (r === '/catalogos/estatus') return Promise.resolve(ESTATUS)
    if (r === '/catalogos/regimenes') return Promise.resolve(REGIMENES)
    if (r === '/catalogos/leyes-probables') return Promise.resolve(LEYES)
    if (r === '/catalogos/afores') return Promise.resolve(AFORES)
    if (r === '/catalogos/tipos-documento') return Promise.resolve(TIPOS)
    if (r === '/catalogos/tipos-correccion') return Promise.resolve(TIPOS_CORRECCION)
    if (r === '/catalogos/tipos-gestion-recuperacion' || r === '/catalogos/tipos-evidencia-recuperacion') return Promise.resolve([])
    if (r === '/agenda' || r === '/avisos') return Promise.resolve([])
    return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))
  })
}

async function abrir(opciones: Opciones = {}) {
  document.body.innerHTML = ''
  setActivePinia(useNuxtApp().$pinia as Pinia)
  rutaMock.params.id = CLIENTE.id
  const fetchMock = api(opciones)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const wrapper = await mountSuspended(DetallePage, { attachTo: document.body })
  await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando las correcciones del cliente/i), { timeout: 4000 })
  await flushPromises()
  return { wrapper, fetchMock }
}
type Pagina = Awaited<ReturnType<typeof abrir>>['wrapper']
const fase = (w: Pagina, k: string) => w.find(`[data-fase-correccion="${k}"]`)
const enDocumento = (selector: string) => document.body.querySelector<HTMLElement>(selector)
const llamadas = (m: ReturnType<typeof api>) => (m.mock.calls as Llamada[]).map(([r, o]) => `${o.method} ${r}`)

describe('Correcciones: detalle del cliente', () => {
  beforeEach(() => sessionStorage.clear())

  it('muestra al cliente, "Regresar" a la lista, "Ver archivos" y una tarjeta por fase (F2, F3 y F4), sin pestañas', async () => {
    const { wrapper } = await abrir()
    expect(wrapper.text()).toContain('María Elena Rodríguez Salas')
    expect(wrapper.find('a[data-accion="regresar"]').attributes('href')).toBe('/correcciones')
    expect(wrapper.find('a[data-accion="ver-archivos"]').attributes('href')).toBe(`/clientes/${CLIENTE.id}/archivos`)
    expect(wrapper.findAll('[data-fase-correccion]').map(f => f.attributes('data-fase-correccion'))).toEqual(['f2', 'f3', 'f4'])
    expect(fase(wrapper, 'f2').text()).toContain('F2 Corrección de datos')
    expect(fase(wrapper, 'f3').text()).toContain('F3 Unificación de NSS')
    expect(fase(wrapper, 'f4').text()).toContain('F4 Recuperación de semanas')
    expect(wrapper.find('[data-tablist="fases"]').exists()).toBe(false)
  })

  it('dice qué fases requiere el cliente: las que ya tienen datos capturados (correcciones, NSS, recuperación en el F1)', async () => {
    const { wrapper } = await abrir()
    const requiere = (k: string) => fase(wrapper, k).find('[data-requiere]').attributes('data-requiere')
    expect(requiere('f2')).toBe('si')
    expect(requiere('f3')).toBe('si')
    expect(requiere('f4')).toBe('si')
  })

  it('el estatus ya no se maneja aquí: solo una etiqueta de la etapa y un enlace al expediente', async () => {
    const { wrapper } = await abrir()
    expect(fase(wrapper, 'f2').find('[data-estatus-etapa]').text()).toBe('En proceso asesor')
    expect(fase(wrapper, 'f3').find('[data-estatus-etapa]').text()).toBe('Finalizado')
    expect(fase(wrapper, 'f2').find('a[data-accion="cambiar-en-expediente"]').attributes('href')).toBe(`/clientes/${CLIENTE.id}`)
    expect(wrapper.find('button[data-accion="cambiar-estatus"]').exists()).toBe(false)
    expect(wrapper.find('button[data-accion="ver-historial"]').exists()).toBe(false)
    expect(wrapper.find('[data-paso-estatus]').exists()).toBe(false)
  })

  describe('F4 y F3 sin requerirse', () => {
    it('una fase que el cliente no requiere aparece plegada con su aviso y se puede abrir', async () => {
      const { wrapper } = await abrir({ correcciones: [CORRECCION_CURP], aplica: 'no', documentos: DOCUMENTOS })
      expect(fase(wrapper, 'f3').find('[data-requiere]').attributes('data-requiere')).toBe('no')
      expect(fase(wrapper, 'f3').text()).toMatch(/no requiere/i)
      expect(fase(wrapper, 'f3').find('[data-contenido-fase]').exists()).toBe(false)
      expect(fase(wrapper, 'f4').find('[data-contenido-fase]').exists()).toBe(false)
      await fase(wrapper, 'f3').find('button[data-accion="mostrar-fase"]').trigger('click')
      expect(fase(wrapper, 'f3').find('[data-contenido-fase]').exists()).toBe(true)
      expect(fase(wrapper, 'f3').text()).toMatch(/registrar unificación de nss/i)
    })

    it('el F4 que el F1 marca como "requiere más evidencia" sí se requiere', async () => {
      const { wrapper } = await abrir({ aplica: 'requiere_mas_evidencia' })
      expect(fase(wrapper, 'f4').find('[data-requiere]').attributes('data-requiere')).toBe('si')
    })

    it('si el cliente aún no tiene análisis de recuperación en el F1, el F4 no se requiere', async () => {
      const { wrapper } = await abrir({ aplica: null })
      expect(fase(wrapper, 'f4').find('[data-requiere]').attributes('data-requiere')).toBe('no')
    })
  })

  describe('F2 Corrección de datos', () => {
    it('lista solo las correcciones manuales (sin la unificación de NSS), con dato actual y correcto', async () => {
      const { wrapper } = await abrir()
      const filas = fase(wrapper, 'f2').findAll('[data-correccion-fila]')
      expect(filas.map(f => f.attributes('data-tipo'))).toEqual(['1', '9'])
      expect(filas[0]!.text()).toContain('Corrección de CURP')
      expect((filas[0]!.find('input[name="dato_actual-cc-1"]').element as HTMLInputElement).value).toBe('ROSM650221MDFDLR00')
      expect((filas[0]!.find('input[name="dato_correcto-cc-1"]').element as HTMLInputElement).value).toBe('ROSM650221MQRDLR09')
      expect(filas[1]!.find('input[name="dato_correcto-cc-9"]').exists()).toBe(false)
    })

    it('editar una corrección y guardarla manda un PATCH solo con lo que cambió', async () => {
      const { wrapper, fetchMock } = await abrir()
      const f2 = fase(wrapper, 'f2')
      expect(f2.find('button[data-accion="guardar-correccion"]').attributes('disabled')).toBeDefined()
      await f2.find('input[name="observaciones-cc-9"]').setValue('Ya se actualizó en SINDO')
      await f2.findAll('[data-correccion-fila]')[1]!.find('button[data-accion="guardar-correccion"]').trigger('click')
      await vi.waitFor(() => expect(llamadas(fetchMock)).toContain(`PATCH /clientes/${CLIENTE.id}/correcciones/cc-9`))
      const patch = (fetchMock.mock.calls as Llamada[]).find(([r, o]) => r.endsWith('/cc-9') && o.method === 'PATCH')!
      expect(patch[1].body).toEqual({ observaciones: 'Ya se actualizó en SINDO' })
    })

    it('agrega una corrección nueva con POST (el tipo "Unificación de NSS" no se ofrece aquí)', async () => {
      const { wrapper, fetchMock } = await abrir()
      const f2 = fase(wrapper, 'f2')
      expect(f2.findAll('select[name="nueva-tipo"] option').map(o => o.attributes('value'))).not.toContain('7')
      await f2.find('select[name="nueva-tipo"]').setValue('3')
      await f2.find('input[name="nueva-observaciones"]').setValue('Acta con el apellido mal')
      await f2.find('button[data-accion="agregar-correccion"]').trigger('click')
      await vi.waitFor(() => expect(llamadas(fetchMock)).toContain(`POST /clientes/${CLIENTE.id}/correcciones`))
      const post = (fetchMock.mock.calls as Llamada[]).find(([, o]) => o.method === 'POST' && (o.body as { tipo_correccion_id?: number })?.tipo_correccion_id === 3)!
      expect(post[1].body).toEqual({ tipo_correccion_id: 3, observaciones: 'Acta con el apellido mal' })
      await vi.waitFor(() => expect(fase(wrapper, 'f2').findAll('[data-correccion-fila]')).toHaveLength(3))
    })

    it('las correcciones que cambian un dato del cliente (CURP, RFC, nombre…) piden el dato correcto', async () => {
      const { wrapper, fetchMock } = await abrir()
      const f2 = fase(wrapper, 'f2')
      await f2.find('select[name="nueva-tipo"]').setValue('1')
      await f2.find('button[data-accion="agregar-correccion"]').trigger('click')
      await flushPromises()
      expect(f2.text()).toMatch(/el dato correcto es obligatorio/i)
      expect(llamadas(fetchMock)).not.toContain(`POST /clientes/${CLIENTE.id}/correcciones`)
    })
  })

  describe('F2: quitar una corrección ya arreglada', () => {
    const quitar = (w: Pagina, tipo: string) => fase(w, 'f2').find(`[data-correccion-fila][data-tipo="${tipo}"] button[data-accion="quitar-correccion"]`)

    it('cada corrección tiene "Quitar", que pide confirmación antes de borrar nada', async () => {
      const { wrapper, fetchMock } = await abrir()
      await quitar(wrapper, '9').trigger('click')
      await vi.waitFor(() => expect(enDocumento('[role="dialog"] button[data-accion="confirmar-quitar"]')).not.toBeNull())
      expect(document.body.querySelector('[role="dialog"]')!.textContent).toContain('Regularización / Actualización de Datos ante IMSS (SINDO)')
      expect(document.body.querySelector('[role="dialog"]')!.textContent).toMatch(/no se puede deshacer/i)
      expect(llamadas(fetchMock).some(l => l.startsWith('DELETE'))).toBe(false)
    })

    it('al confirmar la borra con DELETE y desaparece de la lista', async () => {
      const { wrapper, fetchMock } = await abrir()
      await quitar(wrapper, '9').trigger('click')
      await vi.waitFor(() => expect(enDocumento('[role="dialog"] button[data-accion="confirmar-quitar"]')).not.toBeNull())
      enDocumento('[role="dialog"] button[data-accion="confirmar-quitar"]')!.click()
      await vi.waitFor(() => expect(llamadas(fetchMock)).toContain(`DELETE /clientes/${CLIENTE.id}/correcciones/cc-9`))
      await vi.waitFor(() => expect(fase(wrapper, 'f2').findAll('[data-correccion-fila]').map(f => f.attributes('data-tipo'))).toEqual(['1']))
    })

    it('al quitar la última corrección el cliente deja de requerir F2', async () => {
      const { wrapper } = await abrir({ correcciones: [CORRECCION_SINDO, CORRECCION_NSS] })
      expect(fase(wrapper, 'f2').find('[data-requiere]').attributes('data-requiere')).toBe('si')
      await quitar(wrapper, '9').trigger('click')
      await vi.waitFor(() => expect(enDocumento('[role="dialog"] button[data-accion="confirmar-quitar"]')).not.toBeNull())
      enDocumento('[role="dialog"] button[data-accion="confirmar-quitar"]')!.click()
      await vi.waitFor(() => expect(fase(wrapper, 'f2').find('[data-requiere]').attributes('data-requiere')).toBe('no'))
    })

    it('cancelar deja la corrección como estaba', async () => {
      const { wrapper, fetchMock } = await abrir()
      await quitar(wrapper, '1').trigger('click')
      await vi.waitFor(() => expect(enDocumento('[role="dialog"] button[data-accion="cancelar-quitar"]')).not.toBeNull())
      enDocumento('[role="dialog"] button[data-accion="cancelar-quitar"]')!.click()
      await flushPromises()
      expect(llamadas(fetchMock).some(l => l.startsWith('DELETE'))).toBe(false)
      expect(fase(wrapper, 'f2').findAll('[data-correccion-fila]')).toHaveLength(2)
    })

    it('si el backend no la puede borrar lo dice en el diálogo y la corrección sigue ahí', async () => {
      const { wrapper } = await abrir({ fallaQuitar: true })
      await quitar(wrapper, '9').trigger('click')
      await vi.waitFor(() => expect(enDocumento('[role="dialog"] button[data-accion="confirmar-quitar"]')).not.toBeNull())
      enDocumento('[role="dialog"] button[data-accion="confirmar-quitar"]')!.click()
      await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('La corrección no existe.'))
      expect(fase(wrapper, 'f2').findAll('[data-correccion-fila]')).toHaveLength(2)
    })
  })

  describe('F3 y F4: documentos que se suben', () => {
    it('F3 pide la "Certificación de regularización…" del IMSS y muestra la que ya se subió', async () => {
      const { wrapper } = await abrir()
      const slot = fase(wrapper, 'f3').find('[data-documento-requerido="certificacion"]')
      expect(slot.text()).toContain('Certificación de regularización y/o corrección de datos personales del asegurado')
      expect(slot.find('[data-estado-documento]').attributes('data-estado')).toBe('cargado')
      expect(slot.findAll('[data-documento-fila]').map(f => f.text())).toEqual([expect.stringContaining('Certificación IMSS.pdf')])
      expect(slot.text()).toMatch(/más de un NSS/i)
    })

    it('F4 pide la Constancia de Aclaración (IMSS) y la Solicitud de Reintegro (AFORE); sin archivo dice "Falta documento"', async () => {
      const { wrapper } = await abrir()
      const f4 = fase(wrapper, 'f4')
      expect(f4.find('[data-documento-requerido="constancia"]').text()).toContain('Constancia de Aclaración de Semanas Cotizadas')
      expect(f4.find('[data-documento-requerido="reintegro"]').text()).toContain('Solicitud de Reintegro de Recursos')
      expect(f4.find('[data-documento-requerido="constancia"] [data-estado-documento]').attributes('data-estado')).toBe('falta')
      expect(f4.find('[data-documento-requerido="constancia"]').text()).toMatch(/falta documento/i)
    })

    it('"Subir documento" abre el formulario con ese tipo ya elegido y sube con POST multipart', async () => {
      const { wrapper, fetchMock } = await abrir()
      await fase(wrapper, 'f4').find('[data-documento-requerido="reintegro"] button[data-accion="subir-documento"]').trigger('click')
      await vi.waitFor(() => expect(enDocumento('[role="dialog"] input[type="file"]')).not.toBeNull())
      const select = enDocumento('[role="dialog"] select[name="tipo_documento_id"]') as HTMLSelectElement
      expect(select.value).toBe('17')
      expect(Array.from(select.options).map(o => o.value).filter(Boolean)).toEqual(['17'])
      const input = enDocumento('[role="dialog"] input[type="file"]') as HTMLInputElement
      Object.defineProperty(input, 'files', { value: [new File(['%PDF-1.4'], 'reintegro.pdf', { type: 'application/pdf' })], configurable: true })
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await flushPromises()
      enDocumento('[role="dialog"] button[data-accion="confirmar-subir"]')!.click()
      await vi.waitFor(() => expect(llamadas(fetchMock)).toContain(`POST /clientes/${CLIENTE.id}/documentos`))
      const post = (fetchMock.mock.calls as Llamada[]).find(([r, o]) => r === `/clientes/${CLIENTE.id}/documentos` && o.method === 'POST')!
      expect((post[1].body as FormData).get('tipo_documento_id')).toBe('17')
      await vi.waitFor(() => expect(llamadas(fetchMock).filter(l => l === `GET /clientes/${CLIENTE.id}/documentos`).length).toBeGreaterThanOrEqual(2))
    })

    it('F3 incluye el detalle opcional de NSS principal y secundarios, plegado', async () => {
      const { wrapper } = await abrir()
      expect(fase(wrapper, 'f3').find('details[data-seccion="detalle-nss"]').exists()).toBe(true)
    })

    it('F4 resume el análisis de recuperación del F1 y enlaza a él', async () => {
      const { wrapper } = await abrir()
      await vi.waitFor(() => expect(fase(wrapper, 'f4').find('[data-aplica]').exists()).toBe(true))
      expect(fase(wrapper, 'f4').find('[data-aplica]').text()).toBe('Sí')
      expect(fase(wrapper, 'f4').find('a[data-accion="abrir-f1"]').attributes('href')).toBe(`/clientes/${CLIENTE.id}/f1`)
    })
  })

  it('al abrir pide las correcciones, el análisis del F1 y los documentos (sin pestañas que cargar después)', async () => {
    const { fetchMock } = await abrir()
    const l = llamadas(fetchMock)
    expect(l).toContain(`GET /clientes/${CLIENTE.id}/correcciones`)
    expect(l).toContain(`GET ${D}/recuperacion-semanas`)
    expect(l).toContain(`GET /clientes/${CLIENTE.id}/documentos`)
  })

  it('un cliente que no existe (o no es suyo) muestra "Cliente no encontrado"', async () => {
    const { wrapper } = await abrir({ fallaCliente: 404 })
    expect(wrapper.text()).toMatch(/cliente no encontrado/i)
  })
})
