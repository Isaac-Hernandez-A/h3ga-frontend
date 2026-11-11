import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import F0Page from '~/pages/clientes/[id]/f0.vue'
import { useHistorialLaboral } from '~/composables/useHistorialLaboral'
import { useObjetivos } from '~/composables/useObjetivos'
import { useCorrecciones } from '~/composables/useCorrecciones'
import { edadDesde, formatearFechaCorta } from '~/utils/fechas'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { AFORES, LEYES, REGIMENES, USUARIOS_SUPERVISOR } from './clientes-datos'
import { CLIENTE, DOCUMENTOS, ESTATUS, RESPUESTA_ETAPAS, TIPOS_DOCUMENTO as TIPOS_BASE } from './expediente-datos'

const { navigateToMock, rutaMock } = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return { navigateToMock: vi.fn(), rutaMock: reactive({ params: { id: '' }, path: '', query: {} as Record<string, string>, meta: {} as Record<string, unknown> }) }
})
mockNuxtImport('navigateTo', () => navigateToMock)
mockNuxtImport('useRoute', () => () => rutaMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch() (también su variante .raw).
mockNuxtImport('$fetch', () => {
  const g = globalThis as unknown as { $fetch: ((...a: unknown[]) => unknown) & { raw: (...a: unknown[]) => unknown } }
  return Object.assign((...args: unknown[]) => g.$fetch(...args), { raw: (...args: unknown[]) => g.$fetch.raw(...args) })
})
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

type Llamada = [string, { method: string, body?: Record<string, unknown>, headers?: Record<string, string>, responseType?: string }]

const OBJETIVOS = [
  'Corrección de datos personales', 'Unificación de NSS', 'Aclaración/Recuperación de Semanas', 'Modalidad 10', 'Modalidad 40',
  'Modalidad 40 retroactiva', 'IMSS-ISSSTE/Portabilidad', 'Unificación AFORE/cuentas', 'SAR92/Recursos', 'Solicitud de pensión',
  'Negativa de pensión/recuperación de recursos', 'Juicio y jurisdicción',
].map((nombre, i) => ({ id: i + 1, nombre }))

const TIPOS = [...TIPOS_BASE, { id: 4, nombre: 'Comprobante de Domicilio' }, { id: 5, nombre: 'RFC' }, { id: 6, nombre: 'Constancia de Semanas Cotizadas (IMSS)' }, { id: 7, nombre: 'Reporte de semanas cotizadas' }]
// TIPOS_BASE trae Acta de Nacimiento (1), CURP (2) e INE (3).

const TIPOS_CORRECCION = [
  'Corrección de CURP', 'Corrección de RFC', 'Corrección de Acta de Nacimiento', 'Corrección de Nombre y/o Apellidos',
  'Corrección de Fecha o Lugar de Nacimiento', 'Corrección de Sexo / Género', 'Unificación de NSS (Duplicidad / Multiplicidad)',
  'Corrección de Datos en AFORE', 'Regularización / Actualización de Datos ante IMSS (SINDO)', 'Corrección de Domicilio',
  'Corrección de Clave de Elector (INE)', 'Otro',
].map((nombre, i) => ({ id: i + 1, nombre }))
const CORRECCION_AFORE = { id: 'c0000008-0000-4000-8000-000000000008', cliente_id: CLIENTE.id, tipo_correccion_id: 8, observaciones: 'Actualizar domicilio en la AFORE', tiempo_promedio: '15 días', dato_actual: null, dato_correcto: null }
const CORRECCION_RFC = { id: 'c0000002-0000-4000-8000-000000000002', cliente_id: CLIENTE.id, tipo_correccion_id: 2, observaciones: 'RFC mal capturado', tiempo_promedio: '5 días', dato_actual: 'ROSM650221AB0', dato_correcto: 'ROSM650221AB1' }

const HISTORIAL = { id: 'h0000001-0000-4000-8000-000000000001', cliente_id: CLIENTE.id, semanas_issste: 12, salario_promedio: 1562.2, ultimo_patron: 'Cementos del Golfo S.A.B.', vigencia_derechos: 'si', activo: true }
const ISSSTE = { id: 'i0000001-0000-4000-8000-000000000001', historial_laboral_id: HISTORIAL.id, nss_issste: '1234567890', regimen_pensionario: 'Décimo Transitorio', anios_laborados: 3.5, activo: true }

interface Opciones {
  rol?: Rol
  cliente?: unknown
  historial?: unknown
  issste?: unknown
  correcciones?: unknown[]
  rechazaCorrecciones?: number
  objetivosMarcados?: { cliente_id: string, objetivo_id: number }[]
  documentos?: unknown[]
  rechazaPatch?: { status: number, cuerpo: unknown }
}

function api(opciones: Opciones = {}) {
  const { rol = 'asesor', cliente = CLIENTE, historial, issste, correcciones = [], rechazaCorrecciones, objetivosMarcados = [], documentos = DOCUMENTOS, rechazaPatch } = opciones
  const lista = correcciones.map(c => ({ ...(c as object) })) as Record<string, unknown>[]
  const mock = stubFetch((ruta, o) => {
    const r = ruta as string
    const { method, body } = o as Llamada[1]
    const base = `/clientes/${CLIENTE.id}`
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
    if (r === base && method === 'GET') return Promise.resolve(cliente)
    if (r === base && method === 'PATCH') return rechazaPatch ? Promise.reject(errorHttp(rechazaPatch.status, rechazaPatch.cuerpo)) : Promise.resolve({ ...(cliente as object), ...body })
    if (r === `${base}/etapas`) return Promise.resolve(RESPUESTA_ETAPAS)
    if (r === `${base}/documentos`) return Promise.resolve(documentos)
    if (r === `${base}/historial-laboral` && method === 'GET') return Promise.resolve(historial)
    if (r === `${base}/historial-laboral` && method === 'PUT') return Promise.resolve({ ...HISTORIAL, ...body })
    if (r === `${base}/historial-laboral/issste` && method === 'GET') return Promise.resolve(issste)
    if (r === `${base}/historial-laboral/issste` && method === 'PUT') return Promise.resolve({ ...ISSSTE, ...body })
    if (r === '/catalogos/tipos-correccion') return Promise.resolve(TIPOS_CORRECCION)
    if (r === `${base}/correcciones` && method === 'GET') return rechazaCorrecciones ? Promise.reject(errorHttp(rechazaCorrecciones, { message: 'Sin permiso' })) : Promise.resolve(lista)
    if (r === `${base}/correcciones` && method === 'POST') {
      const nueva = { id: `n${lista.length}000000-0000-4000-8000-000000000000`, cliente_id: CLIENTE.id, observaciones: null, tiempo_promedio: null, dato_actual: null, dato_correcto: null, ...body }
      lista.push(nueva)
      return Promise.resolve(nueva)
    }
    const unaCorreccion = r.match(new RegExp(`^${base}/correcciones/([^/]+)$`))
    if (unaCorreccion && method === 'PATCH') {
      const actual = lista.find(c => c.id === unaCorreccion[1])!
      return Promise.resolve(Object.assign(actual, body))
    }
    if (r === `${base}/objetivos-especificos` && method === 'GET') return Promise.resolve(objetivosMarcados)
    if (r === `${base}/objetivos-especificos` && method === 'PUT') return Promise.resolve((body!.objetivo_ids as number[]).map(id => ({ cliente_id: CLIENTE.id, objetivo_id: id })))
    if (r === '/catalogos/objetivos-especificos') return Promise.resolve(OBJETIVOS)
    if (r === '/catalogos/tipos-documento') return Promise.resolve(TIPOS)
    if (r === '/catalogos/estatus') return Promise.resolve(ESTATUS)
    if (r === '/catalogos/regimenes') return Promise.resolve(REGIMENES)
    if (r === '/catalogos/leyes-probables') return Promise.resolve(LEYES)
    if (r === '/catalogos/afores') return Promise.resolve(AFORES)
    if (r === '/usuarios') return Promise.resolve(USUARIOS_SUPERVISOR)
    if (r === '/agenda' || r === '/avisos') return Promise.resolve([])
    return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))
  })
  ;(mock as unknown as { raw: unknown }).raw = vi.fn(() =>
    Promise.resolve({ headers: new Headers({ 'content-disposition': 'attachment; filename="F0-cliente.pdf"' }), _data: new Blob(['%PDF-1.4']) }),
  )
  return mock as typeof mock & { raw: ReturnType<typeof vi.fn> }
}

async function abrir(paso: number | null = null, opciones: Opciones = {}) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  rutaMock.params.id = CLIENTE.id
  rutaMock.query = paso ? { paso: String(paso) } : {}
  const fetchMock = api(opciones)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const wrapper = await mountSuspended(F0Page)
  await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando el diagnóstico/i))
  return { wrapper, fetchMock }
}
const llamadas = (m: Awaited<ReturnType<typeof abrir>>['fetchMock'], metodo: string, ruta: string) => (m.mock.calls as Llamada[]).filter(([r, o]) => r === ruta && o.method === metodo)
const base = `/clientes/${CLIENTE.id}`
type Pagina = Awaited<ReturnType<typeof abrir>>['wrapper']
const campo = (w: Pagina, nombre: string) => w.find(`[name="${nombre}"]`)
const clic = async (w: Pagina, accion: string) => {
  await w.find(`button[data-accion="${accion}"]`).trigger('click')
  await flushPromises()
}

describe('composables del F0', () => {
  beforeEach(async () => {
    sessionStorage.clear()
    setActivePinia(useNuxtApp().$pinia as Pinia)
  })

  it('useHistorialLaboral e useObjetivos usan las rutas del backend', async () => {
    stubFetch(() => Promise.resolve({ ...SESION_API }))
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const fetchMock = stubFetch(() => Promise.resolve([]))

    const historial = useHistorialLaboral(CLIENTE.id)
    await historial.obtener()
    await historial.guardar({ semanas_issste: 1, salario_promedio: 2, ultimo_patron: 'x', vigencia_derechos: 'si' })
    await historial.obtenerIssste()
    await historial.guardarIssste({ nss_issste: '1', regimen_pensionario: 'x', anios_laborados: null })
    const objetivos = useObjetivos(CLIENTE.id)
    await objetivos.catalogo()
    await objetivos.marcados()
    await objetivos.reemplazar([3, 1])

    const registro = (fetchMock.mock.calls as Llamada[]).map(([ruta, o]) => `${o.method} ${ruta} ${JSON.stringify(o.body ?? null)}`)
    expect(registro).toEqual([
      `GET ${base}/historial-laboral null`,
      `PUT ${base}/historial-laboral {"semanas_issste":1,"salario_promedio":2,"ultimo_patron":"x","vigencia_derechos":"si"}`,
      `GET ${base}/historial-laboral/issste null`,
      `PUT ${base}/historial-laboral/issste {"nss_issste":"1","regimen_pensionario":"x","anios_laborados":null}`,
      'GET /catalogos/objetivos-especificos null',
      `GET ${base}/objetivos-especificos null`,
      `PUT ${base}/objetivos-especificos {"objetivo_ids":[3,1]}`,
    ])
  })
})

describe('useCorrecciones', () => {
  it('usa las rutas del backend: catálogo, lista, alta y actualización parcial', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    stubFetch(() => Promise.resolve({ ...SESION_API }))
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const fetchMock = stubFetch(() => Promise.resolve([]))

    const api = useCorrecciones(CLIENTE.id)
    await api.tipos()
    await api.listar()
    await api.crear({ tipo_correccion_id: 8, observaciones: 'x' })
    await api.actualizar('abc', { tiempo_promedio: null })

    const registro = (fetchMock.mock.calls as Llamada[]).map(([ruta, o]) => `${o.method} ${ruta} ${JSON.stringify(o.body ?? null)}`)
    expect(registro).toEqual([
      'GET /catalogos/tipos-correccion null',
      `GET ${base}/correcciones null`,
      `POST ${base}/correcciones {"tipo_correccion_id":8,"observaciones":"x"}`,
      `PATCH ${base}/correcciones/abc {"tiempo_promedio":null}`,
    ])
  })
})

describe('Diagnóstico inicial F0 (wizard)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    document.body.innerHTML = ''
  })

  it('muestra el encabezado: título corregido, avance de la etapa Diagnóstico inicial, fecha y asesor responsable', async () => {
    const { wrapper } = await abrir()

    expect(wrapper.find('[data-f0-titulo]').text()).toBe('F0 → Diagnóstico inicial')
    expect(wrapper.find('[data-f0-avance]').text()).toContain('100%')
    expect(wrapper.find('[data-f0-fecha]').text()).toContain(formatearFechaCorta(CLIENTE.fecha_ingreso))
    expect(wrapper.find('[data-f0-asesor]').text()).toContain('Ana')
    expect(wrapper.text()).not.toMatch(/diagnostico|diganostico/i) // sin los errores de ortografía del wireframe
    expect(wrapper.find('a[data-accion="ver-expediente"]').attributes('href')).toBe(`/clientes/${CLIENTE.id}`)
  })

  it('el botón de Diagnóstico especializado (F1) lleva a la pantalla del F1, solo para el Asesor', async () => {
    const asesor = await abrir()
    expect(asesor.wrapper.find('a[data-accion="diagnostico-especializado"]').attributes('href')).toBe(`/clientes/${CLIENTE.id}/f1`)
    asesor.wrapper.unmount()

    const supervisor = await abrir(null, { rol: 'supervisor' })
    expect(supervisor.wrapper.find('[data-accion="diagnostico-especializado"]').exists()).toBe(false)
  })

  it('tiene los 6 pasos del wireframe y Continuar/Retroceder navegan entre ellos', async () => {
    const { wrapper, fetchMock } = await abrir()
    const titulos = () => wrapper.findAll('[data-paso]').map(p => p.text())
    expect(titulos().join('|')).toMatch(/Datos generales del cliente.*Documentación inicial.*Diagnóstico inicial.*Correcciones y validaciones.*Historial laboral.*Observaciones generales/)
    expect(wrapper.findAll('[data-paso]')).toHaveLength(6)
    expect(wrapper.find('[data-paso][aria-current="step"]').text()).toContain('Datos generales del cliente')
    expect(wrapper.find('button[data-accion="retroceder"]').exists()).toBe(false)

    await clic(wrapper, 'continuar') // guarda el paso 1 y avanza
    expect(wrapper.find('[data-paso][aria-current="step"]').text()).toContain('Documentación inicial')
    expect(llamadas(fetchMock, 'PATCH', base)).toHaveLength(1)

    await clic(wrapper, 'retroceder')
    expect(wrapper.find('[data-paso][aria-current="step"]').text()).toContain('Datos generales del cliente')
  })

  it('el Auxiliar no tiene esta pantalla (no puede leer historial ni objetivos): lo manda al expediente', async () => {
    await abrir(null, { rol: 'auxiliar' })

    expect(navigateToMock).toHaveBeenCalledWith(`/clientes/${CLIENTE.id}`)
  })

  it('el Supervisor la ve en solo lectura: sin Guardar ni Continuar que modifique y con los campos deshabilitados', async () => {
    const { wrapper } = await abrir(null, { rol: 'supervisor' })

    expect(wrapper.find('button[data-accion="guardar"]').exists()).toBe(false)
    expect(wrapper.find('fieldset[disabled]').exists()).toBe(true)
    expect(wrapper.text()).toMatch(/solo lectura/i)
  })

  it('un cliente inexistente muestra "Cliente no encontrado"', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    rutaMock.params.id = CLIENTE.id
    rutaMock.query = {}
    stubFetch((ruta) => {
      if (ruta === '/auth/login') return Promise.resolve(SESION_API)
      if (ruta === base) return Promise.reject(errorHttp(404, { message: 'Cliente no encontrado.' }))
      return Promise.resolve([])
    })
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')

    const wrapper = await mountSuspended(F0Page)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Cliente no encontrado'))
  })

  describe('paso 1: datos generales', () => {
    it('precarga los datos del cliente, calcula la edad (no se escribe) y pide la subdelegación una sola vez', async () => {
      const { wrapper } = await abrir(1)

      expect((campo(wrapper, 'nombre').element as HTMLInputElement).value).toBe('María Elena')
      expect((campo(wrapper, 'apellido_paterno').element as HTMLInputElement).value).toBe('Rodríguez')
      expect((campo(wrapper, 'curp').element as HTMLInputElement).value).toBe('ROSM800315MDFDLR09')
      const edad = campo(wrapper, 'edad')
      expect((edad.element as HTMLInputElement).value).toBe(String(edadDesde(CLIENTE.fecha_nacimiento)))
      expect(edad.attributes('readonly')).toBeDefined()
      expect(wrapper.findAll('[name="subdelegacion_imss_probable"]')).toHaveLength(1)
      // Los campos de otros pasos no están aquí.
      expect(wrapper.find('[name="objetivo_cliente"]').exists()).toBe(false)
      expect(wrapper.find('[name="observaciones_generales"]').exists()).toBe(false)
    })

    it('Guardar envía PATCH con solo los campos de este paso (guardado parcial) y la edad se actualiza con la fecha de nacimiento', async () => {
      const { wrapper, fetchMock } = await abrir(1)
      await campo(wrapper, 'telefono').setValue('9990001111')
      await campo(wrapper, 'fecha_nacimiento').setValue('1999-03-20')
      expect((campo(wrapper, 'edad').element as HTMLInputElement).value).toBe(String(edadDesde('1999-03-20')))

      await clic(wrapper, 'guardar')

      const [[, opciones]] = llamadas(fetchMock, 'PATCH', base)
      expect(opciones.body).toMatchObject({ telefono: '9990001111', fecha_nacimiento: '1999-03-20', nombre: 'María Elena' })
      for (const ajeno of ['objetivo_cliente', 'observaciones_generales', 'edad', 'asesor_id']) {
        expect(opciones.body, ajeno).not.toHaveProperty(ajeno)
      }
    })

    it('valida antes de guardar y no avanza con Continuar si hay errores', async () => {
      const { wrapper, fetchMock } = await abrir(1)
      await campo(wrapper, 'nombre').setValue('')

      await clic(wrapper, 'continuar')

      expect(wrapper.text()).toMatch(/ingresa el nombre/i)
      expect(llamadas(fetchMock, 'PATCH', base)).toHaveLength(0)
      expect(wrapper.find('[data-paso][aria-current="step"]').text()).toContain('Datos generales del cliente')
    })

    it('una CURP repetida (409) se muestra bajo el campo CURP y no avanza', async () => {
      const { wrapper } = await abrir(1, { rechazaPatch: { status: 409, cuerpo: { message: 'Ya existe un cliente con esa CURP.' } } })

      await clic(wrapper, 'continuar')

      expect(wrapper.find('[data-campo="curp"]').text()).toContain('Ya existe un cliente con esa CURP.')
      expect(wrapper.find('[data-paso][aria-current="step"]').text()).toContain('Datos generales del cliente')
    })

    it('las opciones de cambio de AFORE incluyen "Por confirmar", como el contrato de la API', async () => {
      const { wrapper } = await abrir(1)

      expect(campo(wrapper, 'cambio_afore').text()).toContain('Por confirmar')
    })
  })

  describe('paso 2: documentación inicial', () => {
    it('marca los documentos recibidos según los archivos subidos y lista los archivos del expediente', async () => {
      const { wrapper } = await abrir(2)

      const marcado = (nombre: string) => (wrapper.findAll('[data-documento-tipo]').find(d => d.text().includes(nombre))!.find('input[type="checkbox"]').element as HTMLInputElement).checked
      expect(wrapper.findAll('[data-documento-tipo]')).toHaveLength(6)
      expect(marcado('Acta de Nacimiento')).toBe(true) // hay un archivo de este tipo
      expect(marcado('CURP')).toBe(true)
      expect(marcado('INE')).toBe(true)
      expect(marcado('RFC')).toBe(false)
      expect(marcado('Comprobante de Domicilio')).toBe(false)
      expect(wrapper.text()).toContain('Constancia de semanas cotizadas.pdf')
    })

    it('las casillas son indicadores (se marcan solas al subir archivos): no se pueden cambiar a mano', async () => {
      const { wrapper } = await abrir(2)

      for (const caja of wrapper.findAll('[data-documento-tipo] input[type="checkbox"]')) {
        expect(caja.attributes('disabled')).toBeDefined()
      }
    })

    it('ofrece subir documentos al Asesor, con las mismas reglas de tipo y tamaño que la pantalla de archivos', async () => {
      const { wrapper } = await abrir(2)

      await wrapper.find('button[data-accion="anadir"]').trigger('click')
      await vi.waitFor(() => expect(document.body.querySelector('select[name="tipo_documento_id"]')).not.toBeNull())
      expect(document.body.textContent).toMatch(/pdf, jpg o png/i)
    })

    it('sin documentos lo dice', async () => {
      const { wrapper } = await abrir(2, { documentos: [] })

      expect(wrapper.text()).toMatch(/aún no hay documentos/i)
    })
  })

  describe('paso 3: diagnóstico inicial (objetivos)', () => {
    it('muestra el objetivo del cliente y los 12 servicios del catálogo, con los marcados que ya tiene', async () => {
      const marcados = [{ cliente_id: CLIENTE.id, objetivo_id: 4 }, { cliente_id: CLIENTE.id, objetivo_id: 7 }]
      const { wrapper } = await abrir(3, { objetivosMarcados: marcados })

      expect((campo(wrapper, 'objetivo_cliente').element as HTMLSelectElement).value).toBe('pensionarse_asap')
      const cajas = wrapper.findAll('[data-objetivo-especifico] input[type="checkbox"]')
      expect(cajas).toHaveLength(12)
      expect(wrapper.text()).toContain('IMSS-ISSSTE/Portabilidad')
      expect(cajas.filter(c => (c.element as HTMLInputElement).checked)).toHaveLength(2)
      expect((wrapper.find('[name="objetivo-4"]').element as HTMLInputElement).checked).toBe(true)
    })

    it('Guardar reemplaza los objetivos con PUT y actualiza el objetivo del cliente con PATCH', async () => {
      const { wrapper, fetchMock } = await abrir(3)
      await campo(wrapper, 'objetivo_cliente').setValue('mejorar_monto_pension')
      await wrapper.find('[name="objetivo-5"]').setValue(true)
      await wrapper.find('[name="objetivo-2"]').setValue(true)

      await clic(wrapper, 'guardar')

      const [[, put]] = llamadas(fetchMock, 'PUT', `${base}/objetivos-especificos`)
      expect(put.body).toEqual({ objetivo_ids: [2, 5] })
      const [[, patch]] = llamadas(fetchMock, 'PATCH', base)
      expect(patch.body).toEqual({ objetivo_cliente: 'mejorar_monto_pension' })
    })

    it('permite quitar todos los objetivos marcados (envía una lista vacía)', async () => {
      const { wrapper, fetchMock } = await abrir(3, { objetivosMarcados: [{ cliente_id: CLIENTE.id, objetivo_id: 4 }] })
      await wrapper.find('[name="objetivo-4"]').setValue(false)

      await clic(wrapper, 'guardar')

      expect(llamadas(fetchMock, 'PUT', `${base}/objetivos-especificos`)[0]![1].body).toEqual({ objetivo_ids: [] })
    })
  })

  describe('paso 4: correcciones y validaciones', () => {
    const fila = (w: Pagina, tipo: number | string) => w.find(`[data-correccion="${tipo}"]`)
    const FILAS = [1, 3, 7, 8, 9, 12]

    it('muestra la tabla del wireframe: CURP, Acta, Unificación NSS, AFORE, Actualización IMSS y Otro', async () => {
      const { wrapper } = await abrir(4)

      expect(wrapper.findAll('[data-correccion]').map(f => f.attributes('data-correccion'))).toEqual(FILAS.map(String))
      const filas = wrapper.findAll('[data-correccion]').map(f => f.find('[data-tramite]').text())
      expect(filas.slice(0, 5)).toEqual(['Corrección CURP', 'Corrección Acta', 'Unificación NSS', 'Corrección AFORE', 'Actualización IMSS'])
      expect(campo(wrapper, 'tramite-12').attributes('placeholder')).toMatch(/otro \(especifica el trámite\)/i)
      expect(wrapper.text()).toMatch(/tabla de correcciones/i)
      for (const t of FILAS) {
        expect(fila(wrapper, t).find(`[name="observaciones-${t}"]`).exists()).toBe(true)
        expect(fila(wrapper, t).find(`[name="tiempo-${t}"]`).exists()).toBe(true)
      }
    })

    it('precarga las correcciones del cliente y pide el catálogo de tipos', async () => {
      const { wrapper, fetchMock } = await abrir(4, { correcciones: [CORRECCION_AFORE] })

      expect((campo(wrapper, 'observaciones-8').element as HTMLInputElement).value).toBe('Actualizar domicilio en la AFORE')
      expect((campo(wrapper, 'tiempo-8').element as HTMLInputElement).value).toBe('15 días')
      expect(llamadas(fetchMock, 'GET', '/catalogos/tipos-correccion')).toHaveLength(1)
      expect(llamadas(fetchMock, 'GET', `${base}/correcciones`)).toHaveLength(1)
    })

    it('Guardar crea con POST solo las filas con datos (guardado parcial)', async () => {
      const { wrapper, fetchMock } = await abrir(4)
      await campo(wrapper, 'observaciones-8').setValue('Actualizar domicilio')
      await campo(wrapper, 'tiempo-8').setValue('15 días')
      await campo(wrapper, 'observaciones-7').setValue('Dos NSS')

      await clic(wrapper, 'guardar')

      const posts = llamadas(fetchMock, 'POST', `${base}/correcciones`).map(([, o]) => o.body)
      expect(posts).toEqual([
        { tipo_correccion_id: 7, observaciones: 'Dos NSS' },
        { tipo_correccion_id: 8, observaciones: 'Actualizar domicilio', tiempo_promedio: '15 días' },
      ])
    })

    it('una fila ya guardada se actualiza con PATCH solo si cambió; guardar dos veces no repite', async () => {
      const { wrapper, fetchMock } = await abrir(4, { correcciones: [CORRECCION_AFORE] })

      await clic(wrapper, 'guardar')
      expect(llamadas(fetchMock, 'PATCH', `${base}/correcciones/${CORRECCION_AFORE.id}`)).toHaveLength(0)

      await campo(wrapper, 'tiempo-8').setValue('20 días')
      await clic(wrapper, 'guardar')
      await clic(wrapper, 'guardar')

      const patches = llamadas(fetchMock, 'PATCH', `${base}/correcciones/${CORRECCION_AFORE.id}`)
      expect(patches).toHaveLength(1)
      expect(patches[0]![1].body).toEqual({ observaciones: 'Actualizar domicilio en la AFORE', tiempo_promedio: '20 días', dato_actual: null, dato_correcto: null })
      expect(llamadas(fetchMock, 'POST', `${base}/correcciones`)).toHaveLength(0)
    })

    it('al crear y volver a guardar, la fila ya creada se actualiza (no se crea otra)', async () => {
      const { wrapper, fetchMock } = await abrir(4)
      await campo(wrapper, 'observaciones-3').setValue('Acta con error')
      await clic(wrapper, 'guardar')
      await campo(wrapper, 'observaciones-3').setValue('Acta con dos errores')
      await clic(wrapper, 'guardar')

      expect(llamadas(fetchMock, 'POST', `${base}/correcciones`)).toHaveLength(1)
      expect(llamadas(fetchMock, 'PATCH', `${base}/correcciones/n0000000-0000-4000-8000-000000000000`)).toHaveLength(1)
    })

    it('las correcciones de CURP (y RFC, nombre, nacimiento, sexo) piden dato actual y dato correcto: el dato correcto es obligatorio', async () => {
      const { wrapper, fetchMock } = await abrir(4)
      expect(fila(wrapper, 1).find('[name="dato_correcto-1"]').exists()).toBe(false)
      await campo(wrapper, 'observaciones-1').setValue('CURP con error')
      expect(fila(wrapper, 1).find('[name="dato_correcto-1"]').exists()).toBe(true)

      await clic(wrapper, 'guardar')
      expect(wrapper.find('[data-correccion="1"]').text()).toMatch(/el dato correcto es obligatorio/i)
      expect(llamadas(fetchMock, 'POST', `${base}/correcciones`)).toHaveLength(0)

      await campo(wrapper, 'dato_actual-1').setValue('ROSM650221MDFDLR00')
      await campo(wrapper, 'dato_correcto-1').setValue('ROSM650221MDFDLR09')
      await clic(wrapper, 'guardar')
      expect(llamadas(fetchMock, 'POST', `${base}/correcciones`)[0]![1].body).toEqual({
        tipo_correccion_id: 1, observaciones: 'CURP con error', dato_actual: 'ROSM650221MDFDLR00', dato_correcto: 'ROSM650221MDFDLR09',
      })
    })

    it('"Otro" necesita especificar el trámite, que se guarda como dato actual', async () => {
      const { wrapper, fetchMock } = await abrir(4)
      await campo(wrapper, 'observaciones-12').setValue('Algo distinto')
      await clic(wrapper, 'guardar')
      expect(wrapper.find('[data-correccion="12"]').text()).toMatch(/especifica el trámite/i)
      expect(llamadas(fetchMock, 'POST', `${base}/correcciones`)).toHaveLength(0)

      await campo(wrapper, 'tramite-12').setValue('Baja de beneficiario')
      await clic(wrapper, 'guardar')
      expect(llamadas(fetchMock, 'POST', `${base}/correcciones`)[0]![1].body).toEqual({ tipo_correccion_id: 12, observaciones: 'Algo distinto', dato_actual: 'Baja de beneficiario' })
    })

    it('las correcciones de otros tipos que ya existen aparecen como filas extra con el nombre del catálogo', async () => {
      const { wrapper } = await abrir(4, { correcciones: [CORRECCION_RFC] })

      const extra = wrapper.find(`[data-correccion="extra-${CORRECCION_RFC.id}"]`)
      expect(extra.find('[data-tramite]').text()).toBe('Corrección de RFC')
      expect((extra.find('input[name^="observaciones"]').element as HTMLInputElement).value).toBe('RFC mal capturado')
      expect((extra.find('input[name^="dato_correcto"]').element as HTMLInputElement).value).toBe('ROSM650221AB1')
    })

    it('un error 400 del backend se muestra y no da el paso por guardado', async () => {
      const { wrapper, fetchMock } = await abrir(4)
      const original = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation((ruta, o) =>
        ruta === `${base}/correcciones` && (o as Llamada[1]).method === 'POST' ? Promise.reject(errorHttp(400, { message: 'tiempo_promedio inválido' })) : original(ruta, o))
      await campo(wrapper, 'observaciones-3').setValue('x')

      await clic(wrapper, 'continuar')

      expect(wrapper.find('[role="alert"]').text()).toMatch(/tiempo_promedio inválido/i)
      expect(wrapper.find('[data-paso][aria-current="step"]').text()).toContain('Correcciones y validaciones')
    })

    it('si no se pueden leer las correcciones (403 del Supervisor), lo dice y no ofrece la tabla (evita duplicados)', async () => {
      const { wrapper } = await abrir(4, { rol: 'supervisor', rechazaCorrecciones: 403 })

      expect(wrapper.text()).toMatch(/no se pudieron cargar las correcciones/i)
      expect(wrapper.find('[data-correccion]').exists()).toBe(false)
    })
  })

  describe('paso 5: historial laboral', () => {
    it('precarga el historial laboral y la información ISSSTE que ya existen, y las semanas IMSS del cliente', async () => {
      const { wrapper } = await abrir(5, { historial: HISTORIAL, issste: ISSSTE })

      expect((campo(wrapper, 'semanas_imss_reconocidas').element as HTMLInputElement).value).toBe(String(CLIENTE.semanas_imss_reconocidas))
      expect((campo(wrapper, 'semanas_issste').element as HTMLInputElement).value).toBe('12')
      expect((campo(wrapper, 'salario_promedio').element as HTMLInputElement).value).toBe('1562.2')
      expect((campo(wrapper, 'ultimo_patron').element as HTMLInputElement).value).toBe('Cementos del Golfo S.A.B.')
      expect((campo(wrapper, 'vigencia_derechos').element as HTMLSelectElement).value).toBe('si')
      expect((campo(wrapper, 'nss_issste').element as HTMLInputElement).value).toBe('1234567890')
    })

    it('la vigencia de derechos es Sí, No o Por confirmar (como el contrato), no un texto libre', async () => {
      const { wrapper } = await abrir(5)

      const opciones = campo(wrapper, 'vigencia_derechos').findAll('option').map(o => o.text())
      expect(opciones).toEqual(['Sí', 'No', 'Por confirmar'])
    })

    it('un cliente sin historial laboral (respuesta vacía) muestra el formulario vacío, no un error', async () => {
      const { wrapper } = await abrir(5)

      expect((campo(wrapper, 'semanas_issste').element as HTMLInputElement).value).toBe('0')
      expect((campo(wrapper, 'ultimo_patron').element as HTMLInputElement).value).toBe('')
      expect(wrapper.text()).not.toMatch(/no se pudo cargar/i)
    })

    it('Guardar actualiza las semanas IMSS con PATCH y envía PUT del historial laboral con números', async () => {
      const { wrapper, fetchMock } = await abrir(5)
      await campo(wrapper, 'semanas_imss_reconocidas').setValue('1630')
      await campo(wrapper, 'semanas_issste').setValue('0')
      await campo(wrapper, 'salario_promedio').setValue('1562.20')
      await campo(wrapper, 'ultimo_patron').setValue('Cementos del Golfo S.A.B.')
      await campo(wrapper, 'vigencia_derechos').setValue('por_confirmar')

      await clic(wrapper, 'guardar')

      expect(llamadas(fetchMock, 'PATCH', base)[0]![1].body).toEqual({ semanas_imss_reconocidas: 1630 })
      expect(llamadas(fetchMock, 'PUT', `${base}/historial-laboral`)[0]![1].body).toEqual({
        semanas_issste: 0, salario_promedio: 1562.2, ultimo_patron: 'Cementos del Golfo S.A.B.', vigencia_derechos: 'por_confirmar',
      })
      // Sin datos ISSSTE no se crea la información ISSSTE.
      expect(llamadas(fetchMock, 'PUT', `${base}/historial-laboral/issste`)).toHaveLength(0)
    })

    it('valida semanas enteras y un monto con máximo 2 decimales', async () => {
      const { wrapper, fetchMock } = await abrir(5)
      await campo(wrapper, 'semanas_imss_reconocidas').setValue('-5')
      await campo(wrapper, 'semanas_issste').setValue('2.5')
      await campo(wrapper, 'salario_promedio').setValue('15.123')

      await clic(wrapper, 'guardar')

      const texto = wrapper.text()
      expect(texto).toMatch(/entero de 0 o más/i)
      expect(texto).toMatch(/máximo 2 decimales/i)
      expect(fetchMock.mock.calls.some(([, o]) => (o as Llamada[1]).method === 'PUT')).toBe(false)
    })

    it('la información ISSSTE se muestra si existe, si el cliente dice tener ISSSTE o si se capturan semanas ISSSTE', async () => {
      const sin = await abrir(5)
      expect(sin.wrapper.find('[data-issste]').exists()).toBe(false)
      await campo(sin.wrapper, 'semanas_issste').setValue('20')
      expect(sin.wrapper.find('[data-issste]').exists()).toBe(true)
      sin.wrapper.unmount()

      const conCliente = await abrir(5, { cliente: { ...CLIENTE, tiene_issste: 'si' } })
      expect(conCliente.wrapper.find('[data-issste]').exists()).toBe(true)
      expect((campo(conCliente.wrapper, 'nss_issste').element as HTMLInputElement).value).toBe('')
      conCliente.wrapper.unmount()

      const { wrapper } = await abrir(5, { historial: HISTORIAL, issste: ISSSTE })
      expect((campo(wrapper, 'nss_issste').element as HTMLInputElement).value).toBe('1234567890')
      expect((campo(wrapper, 'regimen_pensionario').element as HTMLInputElement).value).toBe('Décimo Transitorio')
      expect((campo(wrapper, 'anios_laborados').element as HTMLInputElement).value).toBe('3.5')
    })

    it('Guardar envía PUT de la información ISSSTE después del historial laboral', async () => {
      const { wrapper, fetchMock } = await abrir(5, { historial: HISTORIAL, issste: ISSSTE })
      await campo(wrapper, 'nss_issste').setValue('99887766554')
      await campo(wrapper, 'anios_laborados').setValue('12.25')

      await clic(wrapper, 'guardar')

      const put = llamadas(fetchMock, 'PUT', `${base}/historial-laboral/issste`)
      expect(put).toHaveLength(1)
      expect(put[0]![1].body).toEqual({ nss_issste: '99887766554', regimen_pensionario: 'Décimo Transitorio', anios_laborados: 12.25 })
      const orden = (fetchMock.mock.calls as Llamada[]).filter(([, o]) => o.method === 'PUT').map(([r]) => r)
      expect(orden).toEqual([`${base}/historial-laboral`, `${base}/historial-laboral/issste`])
    })

    it('los años laborados vacíos se envían como null y se crea la información ISSSTE si el cliente la tiene', async () => {
      const { wrapper, fetchMock } = await abrir(5, { historial: HISTORIAL, cliente: { ...CLIENTE, tiene_issste: 'si' } })
      await campo(wrapper, 'nss_issste').setValue('123')
      await campo(wrapper, 'regimen_pensionario').setValue('Décimo Transitorio')

      await clic(wrapper, 'guardar')

      expect(llamadas(fetchMock, 'PUT', `${base}/historial-laboral/issste`)[0]![1].body).toEqual({ nss_issste: '123', regimen_pensionario: 'Décimo Transitorio', anios_laborados: null })
    })

    it('si el bloque ISSSTE está visible pero vacío y no existe, no se envía nada', async () => {
      const { wrapper, fetchMock } = await abrir(5, { historial: HISTORIAL, cliente: { ...CLIENTE, tiene_issste: 'si' } })

      await clic(wrapper, 'guardar')

      expect(llamadas(fetchMock, 'PUT', `${base}/historial-laboral/issste`)).toHaveLength(0)
      expect(llamadas(fetchMock, 'PUT', `${base}/historial-laboral`)).toHaveLength(1)
    })

    it('valida NSS y régimen del ISSSTE (obligatorios, NSS de máximo 20) y los años (0 a 999.99, 2 decimales) antes de enviar', async () => {
      const { wrapper, fetchMock } = await abrir(5, { historial: HISTORIAL, issste: ISSSTE })
      await campo(wrapper, 'nss_issste').setValue('')
      await campo(wrapper, 'regimen_pensionario').setValue('')
      await campo(wrapper, 'anios_laborados').setValue('1000')
      await clic(wrapper, 'guardar')
      expect(wrapper.find('[data-issste]').text()).toMatch(/nss del issste es obligatorio/i)
      expect(wrapper.find('[data-issste]').text()).toMatch(/régimen pensionario es obligatorio/i)
      expect(wrapper.find('[data-issste]').text()).toMatch(/entre 0 y 999\.99/i)

      await campo(wrapper, 'nss_issste').setValue('1'.repeat(21))
      await campo(wrapper, 'regimen_pensionario').setValue('x')
      await campo(wrapper, 'anios_laborados').setValue('1.234')
      await clic(wrapper, 'guardar')
      expect(wrapper.find('[data-issste]').text()).toMatch(/máximo 20 caracteres/i)
      expect(wrapper.find('[data-issste]').text()).toMatch(/máximo 2 decimales/i)
      expect(fetchMock.mock.calls.some(([, o]) => (o as Llamada[1]).method === 'PUT')).toBe(false)
    })

    it('si el backend rechaza la información ISSSTE (409 sin historial o 400), muestra el mensaje y no da el paso por guardado', async () => {
      const { wrapper, fetchMock } = await abrir(5, { historial: HISTORIAL, issste: ISSSTE })
      const original = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation((ruta, o) =>
        ruta === `${base}/historial-laboral/issste` && (o as Llamada[1]).method === 'PUT' ? Promise.reject(errorHttp(409, { message: 'Primero registra el historial laboral del cliente.' })) : original(ruta, o))

      await clic(wrapper, 'continuar')

      expect(wrapper.find('[role="alert"]').text()).toMatch(/primero registra el historial laboral/i)
      expect(wrapper.find('[data-paso][aria-current="step"]').text()).toContain('Historial laboral')
    })

    it('si guardar el historial falla, muestra el error y no da el paso por guardado', async () => {
      const { wrapper, fetchMock } = await abrir(5, { historial: HISTORIAL })
      const original = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation((ruta, o) =>
        ruta === `${base}/historial-laboral` && (o as Llamada[1]).method === 'PUT' ? Promise.reject(errorHttp(500, { message: 'Error interno del servidor' })) : original(ruta, o))

      await clic(wrapper, 'continuar')

      expect(wrapper.find('[role="alert"]').text()).toMatch(/no se pudo guardar/i)
      expect(wrapper.find('[data-paso][aria-current="step"]').text()).toContain('Historial laboral')
    })
  })

  describe('paso 6: observaciones y descarga', () => {
    it('muestra las observaciones del cliente, las notas importantes y guarda con PATCH', async () => {
      const { wrapper, fetchMock } = await abrir(6, { cliente: { ...CLIENTE, observaciones_generales: 'Notas previas' } })
      expect((campo(wrapper, 'observaciones_generales').element as HTMLTextAreaElement).value).toBe('Notas previas')
      expect(wrapper.text()).toMatch(/notas importantes/i)
      expect(wrapper.text()).toMatch(/protección de datos personales/i)

      await campo(wrapper, 'observaciones_generales').setValue('Cliente con prisa')
      await clic(wrapper, 'guardar')

      expect(llamadas(fetchMock, 'PATCH', base)[0]![1].body).toEqual({ observaciones_generales: 'Cliente con prisa' })
    })

    it('Descargar baja el PDF del F0 con el token y lo guarda con el nombre de la cabecera', async () => {
      const { wrapper, fetchMock } = await abrir(6)
      const guardados: string[] = []
      URL.createObjectURL = vi.fn(() => 'blob:f0')
      URL.revokeObjectURL = vi.fn()
      const clicEnlace = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { guardados.push(this.download) })

      await clic(wrapper, 'descargar-f0')

      const [ruta, opciones] = fetchMock.raw.mock.calls[0] as Llamada
      expect(ruta).toBe(`${base}/diagnostico-inicial/pdf`)
      expect(opciones.headers!.Authorization).toBe(`Bearer ${useSessionStore().token}`)
      expect(guardados).toEqual(['F0-cliente.pdf'])
      clicEnlace.mockRestore()
    })

    it('el último paso ofrece Descargar en lugar de Continuar', async () => {
      const { wrapper } = await abrir(6)

      expect(wrapper.find('button[data-accion="continuar"]').exists()).toBe(false)
      expect(wrapper.find('button[data-accion="descargar-f0"]').exists()).toBe(true)
    })
  })
})
