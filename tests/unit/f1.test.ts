import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import F1Page from '~/pages/clientes/[id]/f1.vue'
import { useDiagnostico } from '~/composables/useDiagnostico'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { AFORES, REGIMENES, USUARIOS_SUPERVISOR } from './clientes-datos'
import { CLIENTE, ESTATUS, RESPUESTA_ETAPAS } from './expediente-datos'
import {
  ASESOR_ID, CAT_DOCUMENTOS, CAT_ESTRATEGIAS, CAT_EVIDENCIAS, CAT_GESTIONES, CAT_INCONSISTENCIAS, CAT_M10, CAT_M40, CAT_OBJETIVOS,
  DIAGNOSTICO, DIAGNOSTICO_VACIO, LEYES_F1,
} from './f1-datos'

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

type Llamada = [string, { method: string, body?: Record<string, unknown>, headers?: Record<string, string> }]
type Registro = Record<string, unknown>

const base = `/clientes/${CLIENTE.id}`
const D = `${base}/diagnostico`
const nuevoId = (() => { let n = 0; return () => `n${String(++n).padStart(7, '0')}-0000-4000-8000-000000000000` })()

interface Opciones {
  rol?: Rol
  diagnostico?: Registro | null
  listas?: Record<string, Registro[]>
  recuperacion?: Registro | null
  retroactivo?: Registro | null
  patrimonial?: Registro | null
  escenarios?: Registro[]
  plan?: Registro[]
  periodos?: Registro[]
  pdf409?: boolean
}

const CATALOGOS: Record<string, { id: number, nombre: string }[]> = {
  'objetivos-diagnostico': CAT_OBJETIVOS, 'estrategias-recomendadas': CAT_ESTRATEGIAS, 'tipos-inconsistencia': CAT_INCONSISTENCIAS,
  'tipos-gestion-recuperacion': CAT_GESTIONES, 'tipos-evidencia-recuperacion': CAT_EVIDENCIAS, 'objetivos-modalidad-10': CAT_M10,
  'objetivos-modalidad-40': CAT_M40, 'documentos-diagnostico': CAT_DOCUMENTOS, 'leyes-probables': LEYES_F1,
  regimenes: REGIMENES, afores: AFORES, estatus: ESTATUS,
}
const CLAVES_LISTA = ['objetivos', 'estrategias-recomendadas', 'inconsistencias-generales', 'objetivos-modalidad-10', 'objetivos-modalidad-40', 'recuperacion-gestiones', 'recuperacion-evidencias', 'documentos', 'criterios-modalidad-10', 'criterios-modalidad-40', 'conveniencia-retroactivo', 'situacion-patrimonial/hijos']

function api(opciones: Opciones = {}) {
  const { rol = 'asesor', pdf409 = false } = opciones
  const bd = {
    diagnostico: opciones.diagnostico === undefined ? null : opciones.diagnostico,
    listas: { ...(opciones.listas ?? {}) } as Record<string, Registro[]>,
    recuperacion: opciones.recuperacion ?? null, retroactivo: opciones.retroactivo ?? null, patrimonial: opciones.patrimonial ?? null,
    escenarios: [...(opciones.escenarios ?? [])], plan: [...(opciones.plan ?? [])], periodos: [...(opciones.periodos ?? [])],
  }
  const mock = stubFetch((ruta, o) => {
    const r = ruta as string
    const { method, body = {} } = o as Llamada[1]
    const ok = (v: unknown) => Promise.resolve(v)
    if (r === '/auth/login') return ok({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
    if (r === base && method === 'GET') return ok(CLIENTE)
    if (r === base && method === 'PATCH') return ok({ ...CLIENTE, ...body })
    if (r === `${base}/etapas`) return ok(RESPUESTA_ETAPAS)
    if (r === `${base}/documentos`) return ok([])
    if (r === `${base}/historial-laboral`) return ok({ id: 'h1', cliente_id: CLIENTE.id, semanas_issste: 0, salario_promedio: 1562.2, ultimo_patron: 'Cementos del Golfo S.A.B.', vigencia_derechos: 'si', activo: true })
    if (r === '/usuarios' || r === '/agenda' || r === '/avisos') return ok(r === '/usuarios' ? USUARIOS_SUPERVISOR : [])
    const cat = r.match(/^\/catalogos\/(.+)$/)
    if (cat) return CATALOGOS[cat[1]!] ? ok(CATALOGOS[cat[1]!]) : Promise.reject(errorHttp(404, { message: `catálogo sin simular: ${r}` }))
    if (!r.startsWith(base)) return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))

    if (r === D) {
      if (method === 'GET') return ok(bd.diagnostico ?? undefined)
      if (method === 'POST') { bd.diagnostico = { id: nuevoId(), cliente_id: CLIENTE.id, fecha_analisis: '2026-11-11', asesor_id: ASESOR_ID, ...DIAGNOSTICO_VACIO, ...body }; return ok(bd.diagnostico) }
      if (method === 'PATCH') { bd.diagnostico = { ...bd.diagnostico, ...body }; return ok(bd.diagnostico) }
    }
    if (r === `${D}/pdf`) return pdf409 ? Promise.reject(errorHttp(409, { message: 'El diagnóstico F1 está incompleto: faltan 2 campos.', faltantes: [{ seccion: 'diagnostico', campo: 'cotizo_antes_julio_1997', etiqueta: '¿Cotizó antes del 1 de julio de 1997? (sección 3)' }, { seccion: 'diagnostico', campo: 'justificacion_estrategia', etiqueta: 'Justificación (sección 12)' }] })) : ok(undefined)
    for (const clave of CLAVES_LISTA) {
      if (r === `${D}/${clave}`) {
        if (method === 'GET') return ok(bd.listas[clave] ?? [])
        if (method === 'PUT') { bd.listas[clave] = (body.items as Registro[]).map(i => ({ ...i })); return ok(bd.listas[clave]) }
      }
    }
    const objeto = (clave: 'recuperacion' | 'retroactivo' | 'patrimonial', ruta: string, extra: Registro = {}) => {
      if (r !== `${D}/${ruta}`) return undefined
      if (method === 'GET') return ok(bd[clave] ?? undefined)
      bd[clave] = { id: bd[clave]?.id ?? nuevoId(), ...extra, ...body }
      return ok(bd[clave])
    }
    const o1 = objeto('recuperacion', 'recuperacion-semanas') ?? objeto('retroactivo', 'modalidad-40-retroactivo') ?? objeto('patrimonial', 'situacion-patrimonial')
    if (o1) return o1
    const coleccion = (clave: 'escenarios' | 'plan' | 'periodos', ruta: string) => {
      const m = r.match(new RegExp(`^${ruta}(?:/([^/]+))?$`))
      if (!m) return undefined
      if (!m[1] && method === 'GET') return ok(bd[clave])
      if (!m[1] && method === 'POST') { const nuevo = { id: nuevoId(), ...body }; bd[clave].push(nuevo); return ok(nuevo) }
      const fila = bd[clave].find(x => x.id === m[1])
      if (method === 'PATCH') return ok(Object.assign(fila!, body))
      if (method === 'DELETE') { bd[clave] = bd[clave].filter(x => x.id !== m[1]); return ok(undefined) }
      return undefined
    }
    const c1 = coleccion('escenarios', `${D}/escenarios`) ?? coleccion('plan', `${D}/plan-accion`) ?? coleccion('periodos', `${base}/periodos-inconsistencias`)
    if (c1) return c1
    return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))
  })
  ;(mock as unknown as { raw: unknown }).raw = vi.fn(() =>
    Promise.resolve({ headers: new Headers({ 'content-disposition': 'attachment; filename="F1-cliente.pdf"' }), _data: new Blob(['%PDF-1.4']) }),
  )
  return Object.assign(mock, { bd }) as typeof mock & { raw: ReturnType<typeof vi.fn>, bd: typeof bd }
}

async function abrir(paso: number | null = null, opciones: Opciones = {}) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  rutaMock.params.id = CLIENTE.id
  rutaMock.query = paso ? { paso: String(paso) } : {}
  const fetchMock = api(opciones)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const wrapper = await mountSuspended(F1Page)
  await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando el diagnóstico/i))
  return { wrapper, fetchMock }
}
type Pagina = Awaited<ReturnType<typeof abrir>>['wrapper']
const llamadas = (m: { mock: { calls: unknown[][] } }, metodo: string, ruta: string) => (m.mock.calls as Llamada[]).filter(([r, o]) => r === ruta && o.method === metodo)
const cuerpo = (m: { mock: { calls: unknown[][] } }, metodo: string, ruta: string, n = 0) => llamadas(m, metodo, ruta)[n]?.[1].body
const campo = (w: Pagina, nombre: string) => w.find(`[name="${nombre}"]`)
const radio = (w: Pagina, nombre: string, valor: string) => w.find(`input[type="radio"][name="${nombre}"][value="${valor}"]`)
const marcar = async (w: Pagina, nombre: string) => { await w.find(`input[type="checkbox"][name="${nombre}"]`).setValue(true) }
const clic = async (w: Pagina, accion: string) => { await w.find(`[data-accion="${accion}"]`).trigger('click'); await flushPromises() }
const pasoActual = (w: Pagina) => w.find('[data-paso][aria-current="step"]').text()

describe('useDiagnostico (rutas del backend)', () => {
  beforeEach(() => sessionStorage.clear())

  it('usa las rutas del F1: borrador, listas completas con PUT y colecciones', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    stubFetch(() => Promise.resolve({ ...SESION_API }))
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const fetchMock = stubFetch(() => Promise.resolve([]))

    const f1 = useDiagnostico(CLIENTE.id)
    await f1.obtener()
    await f1.crear({})
    await f1.actualizar({ edad_objetivo_pension: 65 })
    await f1.leerLista('objetivos')
    await f1.reemplazarLista('objetivos', [{ objetivo_id: 1 }])
    await f1.guardarRecuperacion({ aplica: 'si' })
    await f1.guardarRetroactivo({ meses_retroactivos_estimados: 6 })
    await f1.guardarPatrimonial({ saldo_cuenta_individual: 1 })
    await f1.escenarios.crear({ nombre_escenario: 'Base', orden: 1 })
    await f1.escenarios.actualizar('e1', { orden: 2 })
    await f1.plan.crear({ accion: 'x', estatus: 'pendiente' })
    await f1.plan.eliminar('p1')
    await f1.periodos.actualizar('q1', { nombre_patron: 'x' })

    const registro = (fetchMock.mock.calls as Llamada[]).map(([ruta, o]) => `${o.method} ${ruta}`)
    expect(registro).toEqual([
      `GET ${D}`, `POST ${D}`, `PATCH ${D}`, `GET ${D}/objetivos`, `PUT ${D}/objetivos`,
      `PUT ${D}/recuperacion-semanas`, `PUT ${D}/modalidad-40-retroactivo`, `PUT ${D}/situacion-patrimonial`,
      `POST ${D}/escenarios`, `PATCH ${D}/escenarios/e1`, `POST ${D}/plan-accion`, `DELETE ${D}/plan-accion/p1`,
      `PATCH ${base}/periodos-inconsistencias/q1`,
    ])
  })
})

describe('Diagnóstico Especializado F1 (wizard)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    document.body.innerHTML = ''
  })

  it('muestra el encabezado: título, avance de la etapa 1, fecha del diagnóstico editable y asesor responsable', async () => {
    const { wrapper } = await abrir(null, { diagnostico: DIAGNOSTICO })
    expect(wrapper.find('[data-f1-titulo]').text()).toBe('F1 → Diagnóstico Especializado')
    expect(wrapper.find('[data-f1-avance]').text()).toContain('60%') // etapa 1 de la respuesta simulada
    expect((campo(wrapper, 'fecha_analisis').element as HTMLInputElement).value).toBe('2026-11-11')
    expect(wrapper.find('[data-f1-asesor]').text()).toContain('Ana')
    expect(wrapper.text()).not.toMatch(/diganostico|diagnostico /i)
    const volver = wrapper.find('a[data-accion="diagnostico-inicial"]')
    expect(volver.attributes('href')).toBe(`/clientes/${CLIENTE.id}/f0`)
    expect(volver.text()).toBe('Diagnóstico inicial')
  })

  it('tiene 9 pasos (los 8 del wireframe y el de Modalidad 40 retroactiva, que faltaba) y Continuar/Retroceder navegan', async () => {
    const { wrapper } = await abrir(null, { diagnostico: DIAGNOSTICO })
    const titulos = wrapper.findAll('[data-paso]').map(p => p.text())
    expect(titulos).toHaveLength(9)
    expect(titulos.join('|')).toMatch(/Objetivo del cliente.*Documentos requeridos.*Régimen y semanas cotizadas.*Recuperación y aclaración de semanas.*Conservación y Modalidad 10.*Modalidad 40.*Modalidad 40 con pago retroactivo.*Escenarios y análisis financiero.*Recomendación y plan de acción/)
    expect(pasoActual(wrapper)).toContain('Objetivo del cliente')
    expect(wrapper.find('button[data-accion="retroceder"]').exists()).toBe(false)
    await clic(wrapper, 'continuar')
    expect(pasoActual(wrapper)).toContain('Documentos requeridos')
    await clic(wrapper, 'retroceder')
    expect(pasoActual(wrapper)).toContain('Objetivo del cliente')
  })

  it('solo el Asesor entra: Supervisor y Auxiliar vuelven al expediente', async () => {
    for (const rol of ['supervisor', 'auxiliar'] as Rol[]) {
      navigateToMock.mockReset()
      const { wrapper } = await abrir(null, { rol })
      expect(navigateToMock).toHaveBeenCalledWith(`/clientes/${CLIENTE.id}`)
      wrapper.unmount()
    }
  })

  it('un cliente sin diagnóstico (respuesta vacía) muestra el formulario vacío y no crea nada hasta guardar', async () => {
    const { wrapper, fetchMock } = await abrir()
    expect(wrapper.text()).not.toMatch(/no se pudo cargar/i)
    expect((campo(wrapper, 'comentarios_cliente').element as HTMLTextAreaElement).value).toBe('')
    expect(llamadas(fetchMock, 'POST', D)).toHaveLength(0)
  })

  describe('paso 1: objetivo del cliente', () => {
    it('muestra los 12 objetivos del catálogo con los marcados y el detalle de "Otro"', async () => {
      const { wrapper } = await abrir(1, { diagnostico: DIAGNOSTICO, listas: { objetivos: [{ objetivo_id: 1 }, { objetivo_id: 12, detalle_otro: 'Viajar' }] }, })
      expect(wrapper.findAll('input[type="checkbox"][name^="objetivos-"]').filter(i => !i.attributes('name')!.includes('detalle'))).toHaveLength(12)
      expect((wrapper.find('input[name="objetivos-1"]').element as HTMLInputElement).checked).toBe(true)
      expect((wrapper.find('input[name="objetivos-2"]').element as HTMLInputElement).checked).toBe(false)
      expect((campo(wrapper, 'objetivos-detalle-12').element as HTMLInputElement).value).toBe('Viajar')
      expect(campo(wrapper, 'objetivos-detalle-1').exists()).toBe(false)
    })

    it('el primer Guardar crea el borrador (POST) y luego PATCH de los comentarios y PUT de los objetivos', async () => {
      const { wrapper, fetchMock } = await abrir(1)
      await marcar(wrapper, 'objetivos-3')
      await marcar(wrapper, 'objetivos-12')
      await campo(wrapper, 'objetivos-detalle-12').setValue('Viajar')
      await campo(wrapper, 'comentarios_cliente').setValue('Quiere pensionarse pronto')

      await clic(wrapper, 'guardar')

      expect(llamadas(fetchMock, 'POST', D)).toHaveLength(1)
      expect(cuerpo(fetchMock, 'PATCH', D)).toEqual({ comentarios_cliente: 'Quiere pensionarse pronto' })
      expect(cuerpo(fetchMock, 'PUT', `${D}/objetivos`)).toEqual({ items: [{ objetivo_id: 3 }, { objetivo_id: 12, detalle_otro: 'Viajar' }] })
    })

    it('guardar otra vez no crea otro borrador', async () => {
      const { wrapper, fetchMock } = await abrir(1)
      await marcar(wrapper, 'objetivos-1')
      await clic(wrapper, 'guardar')
      await clic(wrapper, 'guardar')
      expect(llamadas(fetchMock, 'POST', D)).toHaveLength(1)
    })

    it('permite quitar todos los objetivos (envía lista vacía)', async () => {
      const { wrapper, fetchMock } = await abrir(1, { diagnostico: DIAGNOSTICO, listas: { objetivos: [{ objetivo_id: 1 }] } })
      await wrapper.find('input[name="objetivos-1"]').setValue(false)
      await clic(wrapper, 'guardar')
      expect(cuerpo(fetchMock, 'PUT', `${D}/objetivos`)).toEqual({ items: [] })
    })

    it('si el backend rechaza el guardado, muestra el error y no avanza con Continuar', async () => {
      const { wrapper, fetchMock } = await abrir(1, { diagnostico: DIAGNOSTICO })
      const original = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation((ruta, o) => ruta === `${D}/objetivos` ? Promise.reject(errorHttp(400, { message: 'Algún elemento indicado no existe en el catálogo.' })) : original(ruta, o))
      await marcar(wrapper, 'objetivos-1')
      await clic(wrapper, 'continuar')
      expect(wrapper.find('[role="alert"]').text()).toMatch(/no existe en el catálogo/i)
      expect(pasoActual(wrapper)).toContain('Objetivo del cliente')
    })
  })

  describe('paso 2: documentos requeridos', () => {
    it('lista los 9 documentos con Sí/No y observaciones, con lo ya guardado', async () => {
      const { wrapper } = await abrir(2, { diagnostico: DIAGNOSTICO, listas: { documentos: [{ tipo_documento_id: 1, recibido: true, observaciones: 'Original' }, { tipo_documento_id: 2, recibido: false, observaciones: null }] } })
      expect(wrapper.findAll('[data-documento]')).toHaveLength(9)
      expect((radio(wrapper, 'recibido-1', 'true').element as HTMLInputElement).checked).toBe(true)
      expect((radio(wrapper, 'recibido-2', 'false').element as HTMLInputElement).checked).toBe(true)
      expect((campo(wrapper, 'observaciones-doc-1').element as HTMLInputElement).value).toBe('Original')
      expect(wrapper.find('[data-documento="3"]').text()).toContain('Historial laboral IMSS')
    })

    it('Guardar envía solo los documentos contestados o con observaciones', async () => {
      const { wrapper, fetchMock } = await abrir(2, { diagnostico: DIAGNOSTICO })
      await radio(wrapper, 'recibido-4', 'true').setValue(true)
      await radio(wrapper, 'recibido-5', 'false').setValue(true)
      await campo(wrapper, 'observaciones-doc-5').setValue('No aplica')
      await campo(wrapper, 'observaciones-doc-9').setValue('Pendiente de pedir')

      await clic(wrapper, 'guardar')

      expect(cuerpo(fetchMock, 'PUT', `${D}/documentos`)).toEqual({ items: [
        { tipo_documento_id: 4, recibido: true },
        { tipo_documento_id: 5, recibido: false, observaciones: 'No aplica' },
        { tipo_documento_id: 9, observaciones: 'Pendiente de pedir' },
      ] })
    })
  })

  describe('paso 3: régimen y semanas cotizadas', () => {
    it('precarga el diagnóstico, calcula la edad actual y muestra las semanas y el patrón del cliente', async () => {
      const { wrapper } = await abrir(3, { diagnostico: { ...DIAGNOSTICO, edad_objetivo_pension: 65, tipo_pension_probable: 'vejez', cotizo_antes_julio_1997: true, semanas_reintegradas: 12 } })
      expect((campo(wrapper, 'edad_objetivo_pension').element as HTMLInputElement).value).toBe('65')
      expect((campo(wrapper, 'tipo_pension_probable').element as HTMLSelectElement).value).toBe('vejez')
      expect((radio(wrapper, 'cotizo_antes_julio_1997', 'true').element as HTMLInputElement).checked).toBe(true)
      expect((campo(wrapper, 'semanas_reintegradas').element as HTMLInputElement).value).toBe('12')
      expect(wrapper.find('[data-edad-actual]').text()).toMatch(/\d+ años/)
      expect((campo(wrapper, 'semanas_imss_reconocidas').element as HTMLInputElement).value).toBe(String(CLIENTE.semanas_imss_reconocidas))
      expect(campo(wrapper, 'semanas_imss_reconocidas').attributes('readonly')).toBeDefined()
      expect((campo(wrapper, 'ultimo_patron').element as HTMLInputElement).value).toBe('Cementos del Golfo S.A.B.')
    })

    it('el tipo de pensión ofrece Cesantía, Vejez, Invalidez, Viudez y Otro; conservación ofrece "Requiere cálculo"', async () => {
      const { wrapper } = await abrir(3, { diagnostico: DIAGNOSTICO })
      expect(campo(wrapper, 'tipo_pension_probable').findAll('option').map(o => o.text())).toEqual(['Seleccionar', 'Cesantía', 'Vejez', 'Invalidez', 'Viudez', 'Otro'])
      expect(wrapper.find('[data-grupo="tiene_conservacion_derechos"]').text()).toMatch(/requiere cálculo/i)
    })

    it('Guardar envía PATCH con números, fechas y valores del contrato, y solo lo de este paso', async () => {
      const { wrapper, fetchMock } = await abrir(3, { diagnostico: DIAGNOSTICO })
      await campo(wrapper, 'fecha_primera_cotizacion').setValue('1999-03-20')
      await campo(wrapper, 'edad_objetivo_pension').setValue('65')
      await campo(wrapper, 'tipo_pension_probable').setValue('cesantia')
      await radio(wrapper, 'cotizo_antes_julio_1997', 'false').setValue(true)
      await radio(wrapper, 'requiere_reactivacion', 'true').setValue(true)
      await radio(wrapper, 'tiene_conservacion_derechos', 'requiere_validar').setValue(true)
      await campo(wrapper, 'fecha_vencimiento_conservacion').setValue('2028-03-30')
      await campo(wrapper, 'semanas_descontadas').setValue('10')
      await campo(wrapper, 'semanas_efectivas_pension').setValue('1620')
      await campo(wrapper, 'ultimo_salario_cotizado').setValue('1562.20')
      await campo(wrapper, 'fecha_ultima_baja').setValue('2010-03-20')

      await clic(wrapper, 'guardar')

      expect(cuerpo(fetchMock, 'PATCH', D)).toMatchObject({
        fecha_primera_cotizacion: '1999-03-20', edad_objetivo_pension: 65, tipo_pension_probable: 'cesantia', cotizo_antes_julio_1997: false,
        requiere_reactivacion: true, tiene_conservacion_derechos: 'requiere_validar', fecha_vencimiento_conservacion: '2028-03-30',
        semanas_descontadas: 10, semanas_efectivas_pension: 1620, ultimo_salario_cotizado: 1562.2, fecha_ultima_baja: '2010-03-20',
      })
      expect(cuerpo(fetchMock, 'PATCH', D)).not.toHaveProperty('comentarios_cliente')
    })

    it('el régimen probable se guarda en el cliente (ley probable), no en el diagnóstico', async () => {
      const { wrapper, fetchMock } = await abrir(3, { diagnostico: DIAGNOSTICO })
      await radio(wrapper, 'ley_probable_id', '2').setValue(true)
      await clic(wrapper, 'guardar')
      expect(cuerpo(fetchMock, 'PATCH', base)).toEqual({ ley_probable_id: 2 })
      // El diagnóstico no recibe nada: no cambió ningún campo suyo.
      expect(llamadas(fetchMock, 'PATCH', D)).toHaveLength(0)
    })

    it('valida enteros, montos y fechas antes de enviar', async () => {
      const { wrapper, fetchMock } = await abrir(3, { diagnostico: DIAGNOSTICO })
      await campo(wrapper, 'edad_objetivo_pension').setValue('-5')
      await campo(wrapper, 'semanas_descontadas').setValue('2.5')
      await campo(wrapper, 'ultimo_salario_cotizado').setValue('15.123')
      await clic(wrapper, 'guardar')
      expect(wrapper.text()).toMatch(/entero de 0 o más/i)
      expect(wrapper.text()).toMatch(/máximo 2 decimales/i)
      expect(llamadas(fetchMock, 'PATCH', D)).toHaveLength(0)
    })

    it('guarda la revisión de inconsistencias (con detalle de "Otro")', async () => {
      const { wrapper, fetchMock } = await abrir(3, { diagnostico: DIAGNOSTICO })
      expect(wrapper.findAll('input[type="checkbox"][name^="inconsistencias-"]').filter(i => !i.attributes('name')!.includes('detalle'))).toHaveLength(9)
      await marcar(wrapper, 'inconsistencias-2')
      await marcar(wrapper, 'inconsistencias-9')
      await campo(wrapper, 'inconsistencias-detalle-9').setValue('Homónimo en AFORE')
      await clic(wrapper, 'guardar')
      expect(cuerpo(fetchMock, 'PUT', `${D}/inconsistencias-generales`)).toEqual({ items: [{ tipo_id: 2 }, { tipo_id: 9, detalle_otro: 'Homónimo en AFORE' }] })
    })

    it('la tabla de periodos a revisar crea, actualiza y elimina filas', async () => {
      const periodo = { id: 'q1', cliente_id: CLIENTE.id, nombre_patron: 'ACME', periodo_reclamado: '2001-2003', semanas_esperadas: 100, semanas_reconocidas: 0, evidencia_disponible: 'Recibos', accion_sugerida: 'Aclarar', estatus: 'pendiente' }
      const { wrapper, fetchMock } = await abrir(3, { diagnostico: DIAGNOSTICO, periodos: [periodo, { ...periodo, id: 'q2', nombre_patron: 'Otro patrón' }] })
      expect(wrapper.findAll('[data-periodo]')).toHaveLength(2)

      await wrapper.findAll('[data-periodo]')[0]!.find('input[name="semanas_reconocidas"]').setValue('40')
      await wrapper.findAll('[data-periodo]')[1]!.find('[data-accion="quitar-periodo"]').trigger('click')
      await clic(wrapper, 'agregar-periodo')
      const nueva = wrapper.findAll('[data-periodo]')[1]!
      await nueva.find('input[name="nombre_patron"]').setValue('Constructora')
      await nueva.find('input[name="periodo_reclamado"]').setValue('2005')
      await nueva.find('input[name="semanas_esperadas"]').setValue('52')
      await nueva.find('input[name="evidencia_disponible"]').setValue('Contrato')
      await nueva.find('input[name="accion_sugerida"]').setValue('Buscar patrón')
      await clic(wrapper, 'guardar')

      expect(cuerpo(fetchMock, 'PATCH', `${base}/periodos-inconsistencias/q1`)).toEqual({ semanas_reconocidas: 40 })
      expect(llamadas(fetchMock, 'DELETE', `${base}/periodos-inconsistencias/q2`)).toHaveLength(1)
      expect(cuerpo(fetchMock, 'POST', `${base}/periodos-inconsistencias`)).toEqual({ nombre_patron: 'Constructora', periodo_reclamado: '2005', semanas_esperadas: 52, evidencia_disponible: 'Contrato', accion_sugerida: 'Buscar patrón' })
    })

    it('una fila de periodo incompleta no se envía y pide los campos obligatorios', async () => {
      const { wrapper, fetchMock } = await abrir(3, { diagnostico: DIAGNOSTICO })
      await clic(wrapper, 'agregar-periodo')
      await wrapper.find('[data-periodo] input[name="nombre_patron"]').setValue('Solo patrón')
      await clic(wrapper, 'guardar')
      expect(wrapper.find('[data-periodo]').text()).toMatch(/obligatorio/i)
      expect(llamadas(fetchMock, 'POST', `${base}/periodos-inconsistencias`)).toHaveLength(0)
    })
  })

  describe('paso 4: recuperación y aclaración de semanas', () => {
    it('Guardar envía primero el análisis y después las gestiones y la evidencia (con "Otro")', async () => {
      const { wrapper, fetchMock } = await abrir(4, { diagnostico: DIAGNOSTICO })
      await radio(wrapper, 'aplica', 'requiere_mas_evidencia').setValue(true)
      await marcar(wrapper, 'gestiones-1')
      await marcar(wrapper, 'gestiones-8')
      await campo(wrapper, 'gestiones-detalle-8').setValue('Carta al patrón')
      await marcar(wrapper, 'evidencias-2')
      await campo(wrapper, 'observaciones').setValue('Falta evidencia del 2003')

      await clic(wrapper, 'guardar')

      expect(cuerpo(fetchMock, 'PUT', `${D}/recuperacion-semanas`)).toEqual({ aplica: 'requiere_mas_evidencia', observaciones: 'Falta evidencia del 2003' })
      expect(cuerpo(fetchMock, 'PUT', `${D}/recuperacion-gestiones`)).toEqual({ items: [{ tipo_gestion_id: 1 }, { tipo_gestion_id: 8, detalle_otro: 'Carta al patrón' }] })
      expect(cuerpo(fetchMock, 'PUT', `${D}/recuperacion-evidencias`)).toEqual({ items: [{ tipo_evidencia_id: 2 }] })
      const orden = (fetchMock.mock.calls as Llamada[]).filter(([, o]) => o.method === 'PUT').map(([r]) => r)
      expect(orden[0]).toBe(`${D}/recuperacion-semanas`)
    })

    it('precarga el análisis guardado', async () => {
      const { wrapper } = await abrir(4, { diagnostico: DIAGNOSTICO, recuperacion: { id: 'r1', aplica: 'no', observaciones: 'Nada que recuperar' }, listas: { 'recuperacion-gestiones': [{ tipo_gestion_id: 4 }] } })
      expect((radio(wrapper, 'aplica', 'no').element as HTMLInputElement).checked).toBe(true)
      expect((campo(wrapper, 'observaciones').element as HTMLTextAreaElement).value).toBe('Nada que recuperar')
      expect((wrapper.find('input[name="gestiones-4"]').element as HTMLInputElement).checked).toBe(true)
    })

    it('sin responder "¿Aplica?" no se envía el análisis ni las listas', async () => {
      const { wrapper, fetchMock } = await abrir(4, { diagnostico: DIAGNOSTICO })
      await marcar(wrapper, 'gestiones-1')
      await clic(wrapper, 'guardar')
      expect(wrapper.text()).toMatch(/indica si aplica/i)
      expect(llamadas(fetchMock, 'PUT', `${D}/recuperacion-semanas`)).toHaveLength(0)
    })
  })

  describe('paso 5: conservación de derechos y Modalidad 10', () => {
    it('Guardar envía los campos de conservación, el análisis de Modalidad 10, sus objetivos y sus 7 criterios', async () => {
      const { wrapper, fetchMock } = await abrir(5, { diagnostico: DIAGNOSTICO })
      await campo(wrapper, 'fecha_ultima_baja').setValue('2010-03-20')
      await campo(wrapper, 'tiempo_estimado_conservacion_meses').setValue('50')
      await campo(wrapper, 'semanas_reconocidas_al_baja').setValue('1600')
      await radio(wrapper, 'dentro_de_conservacion', 'si').setValue(true)
      await radio(wrapper, 'conviene_pensionar_ahora', 'depende_escenario').setValue(true)
      await radio(wrapper, 'trabaja_cuenta_propia', 'parcialmente').setValue(true)
      await campo(wrapper, 'ingreso_mensual_aproximado').setValue('8000')
      await campo(wrapper, 'actividad_economica').setValue('Comercio')
      await marcar(wrapper, 'm10-1')
      await radio(wrapper, 'm10-criterio-0', 'true').setValue(true)
      await campo(wrapper, 'm10-obs-0').setValue('Tiene local')
      await radio(wrapper, 'conclusion_modalidad_10', 'temporal').setValue(true)

      await clic(wrapper, 'guardar')

      expect(cuerpo(fetchMock, 'PATCH', D)).toMatchObject({
        fecha_ultima_baja: '2010-03-20', tiempo_estimado_conservacion_meses: 50, semanas_reconocidas_al_baja: 1600, dentro_de_conservacion: 'si',
        conviene_pensionar_ahora: 'depende_escenario', trabaja_cuenta_propia: 'parcialmente', ingreso_mensual_aproximado: 8000,
        actividad_economica: 'Comercio', conclusion_modalidad_10: 'temporal',
      })
      expect(cuerpo(fetchMock, 'PUT', `${D}/objetivos-modalidad-10`)).toEqual({ items: [{ objetivo_id: 1 }] })
      const criterios = (cuerpo(fetchMock, 'PUT', `${D}/criterios-modalidad-10`) as { items: Registro[] }).items
      expect(criterios).toHaveLength(7)
      expect(criterios[0]).toEqual({ criterio: 'Tiene actividad independiente real', cumple: true, observaciones: 'Tiene local' })
      expect(criterios[1]).toEqual({ criterio: 'Tiene CURP, NSS y correo' })
    })

    it('la conclusión de Modalidad 10 ofrece las 5 opciones del formato oficial', async () => {
      const { wrapper } = await abrir(5, { diagnostico: DIAGNOSTICO })
      expect(wrapper.findAll('input[name="conclusion_modalidad_10"]').map(i => i.attributes('value'))).toEqual(['aplica', 'no_aplica', 'temporal', 'evaluar', 'requiere_contabilidad'])
    })

    it('el tiempo de conservación se captura en meses enteros y se muestra en años y meses', async () => {
      const { wrapper } = await abrir(5, { diagnostico: { ...DIAGNOSTICO, tiempo_estimado_conservacion_meses: 50 } })
      expect(wrapper.find('[data-conservacion-texto]').text()).toContain('4 años 2 meses')
    })

    it('precarga criterios y objetivos guardados', async () => {
      const { wrapper } = await abrir(5, { diagnostico: DIAGNOSTICO, listas: { 'criterios-modalidad-10': [{ criterio: 'Puede comprobar ingreso / actividad', cumple: false, observaciones: 'Sin comprobantes' }], 'objetivos-modalidad-10': [{ objetivo_id: 6, detalle_otro: 'Seguro' }] } })
      expect((radio(wrapper, 'm10-criterio-2', 'false').element as HTMLInputElement).checked).toBe(true)
      expect((campo(wrapper, 'm10-obs-2').element as HTMLInputElement).value).toBe('Sin comprobantes')
      expect((campo(wrapper, 'm10-detalle-6').element as HTMLInputElement).value).toBe('Seguro')
    })
  })

  describe('paso 6: Modalidad 40', () => {
    it('Guardar envía datos, objetivos, 7 requisitos y conclusión de Modalidad 40', async () => {
      const { wrapper, fetchMock } = await abrir(6, { diagnostico: DIAGNOSTICO })
      await radio(wrapper, 'dado_de_baja_regimen_obligatorio', 'si').setValue(true)
      await campo(wrapper, 'ultimo_salario_cotizado').setValue('1562.20')
      await campo(wrapper, 'meses_propuestos_m40').setValue('24')
      await campo(wrapper, 'fecha_ultima_baja').setValue('2010-03-20')
      await campo(wrapper, 'salario_propuesto_m40').setValue('2000')
      await marcar(wrapper, 'm40-3')
      await radio(wrapper, 'm40-criterio-1', 'no_cumple').setValue(true)
      await campo(wrapper, 'm40-obs-1').setValue('Solo 40 semanas')
      await radio(wrapper, 'conclusion_modalidad_40', 'aplica_con_restricciones').setValue(true)
      await campo(wrapper, 'comentarios_modalidad_40').setValue('Revisar con subdelegación')

      await clic(wrapper, 'guardar')

      expect(cuerpo(fetchMock, 'PATCH', D)).toMatchObject({
        dado_de_baja_regimen_obligatorio: 'si', ultimo_salario_cotizado: 1562.2, meses_propuestos_m40: 24, fecha_ultima_baja: '2010-03-20',
        salario_propuesto_m40: 2000, conclusion_modalidad_40: 'aplica_con_restricciones', comentarios_modalidad_40: 'Revisar con subdelegación',
      })
      expect(cuerpo(fetchMock, 'PUT', `${D}/objetivos-modalidad-40`)).toEqual({ items: [{ objetivo_id: 3 }] })
      const criterios = (cuerpo(fetchMock, 'PUT', `${D}/criterios-modalidad-40`) as { items: Registro[] }).items
      // El backend exige el resultado de cada requisito: solo se envían los contestados.
      expect(criterios).toEqual([{ criterio: 'Tiene al menos 52 semanas en los últimos 5 años previos a baja', cumplimiento: 'no_cumple', observaciones: 'Solo 40 semanas' }])
    })

    it('lista los 7 requisitos y restricciones del formato oficial', async () => {
      const { wrapper } = await abrir(6, { diagnostico: DIAGNOSTICO })
      const filas = wrapper.findAll('[data-requisito]').map(f => f.find('[data-criterio]').text())
      expect(filas).toHaveLength(7)
      expect(filas).toContain('Entiende que Modalidad 40 no otorga servicio médico')
      expect(filas).toContain('Puede cubrir pagos mensuales adelantados')
    })

    it('la conclusión ofrece las 4 opciones del formato oficial', async () => {
      const { wrapper } = await abrir(6, { diagnostico: DIAGNOSTICO })
      expect(wrapper.findAll('input[name="conclusion_modalidad_40"]').map(i => i.attributes('value'))).toEqual(['aplica', 'no_aplica', 'aplica_con_restricciones', 'requiere_regularizacion'])
    })

    it('la fecha de baja y el último salario comparten valor con el resto del diagnóstico', async () => {
      const { wrapper } = await abrir(6, { diagnostico: { ...DIAGNOSTICO, fecha_ultima_baja: '2010-03-20', ultimo_salario_cotizado: 1562.2 } })
      expect((campo(wrapper, 'fecha_ultima_baja').element as HTMLInputElement).value).toBe('2010-03-20')
      expect((campo(wrapper, 'ultimo_salario_cotizado').element as HTMLInputElement).value).toBe('1562.2')
    })
  })

  describe('paso 7: Modalidad 40 con pago retroactivo', () => {
    it('Guardar envía el análisis y después las 6 preguntas de conveniencia', async () => {
      const { wrapper, fetchMock } = await abrir(7, { diagnostico: DIAGNOSTICO })
      await campo(wrapper, 'fecha_propuesta_inicio_m40').setValue('2024-01-01')
      await campo(wrapper, 'meses_retroactivos_estimados').setValue('6')
      await campo(wrapper, 'salario_diario_propuesto').setValue('500.50')
      await campo(wrapper, 'cuotas_estimadas').setValue('12000')
      await campo(wrapper, 'total_estimado_pagar').setValue('13000.75')
      await radio(wrapper, 'baja_por_mora_previa', 'true').setValue(true)
      await radio(wrapper, 'dentro_de_plazo_reingreso', 'requiere_validar').setValue(true)
      await radio(wrapper, 'retro-pregunta-0', 'true').setValue(true)
      await radio(wrapper, 'conclusion_retroactivo', 'conviene_parcialmente').setValue(true)

      await clic(wrapper, 'guardar')

      expect(cuerpo(fetchMock, 'PUT', `${D}/modalidad-40-retroactivo`)).toMatchObject({
        fecha_propuesta_inicio_m40: '2024-01-01', meses_retroactivos_estimados: 6, salario_diario_propuesto: 500.5, cuotas_estimadas: 12000,
        total_estimado_pagar: 13000.75, baja_por_mora_previa: true, dentro_de_plazo_reingreso: 'requiere_validar', conclusion_retroactivo: 'conviene_parcialmente',
      })
      const items = (cuerpo(fetchMock, 'PUT', `${D}/conveniencia-retroactivo`) as { items: Registro[] }).items
      expect(items).toHaveLength(6)
      expect(items[0]).toEqual({ pregunta: '¿El retroactivo mejora salario promedio?', respuesta: true })
      expect(items[1]).toEqual({ pregunta: '¿Reduce tiempo para pensionarse?' })
      const orden = (fetchMock.mock.calls as Llamada[]).filter(([, o]) => o.method === 'PUT').map(([r]) => r)
      expect(orden[0]).toBe(`${D}/modalidad-40-retroactivo`)
    })

    it('ofrece las 4 conclusiones del formato oficial y precarga lo guardado', async () => {
      const { wrapper } = await abrir(7, { diagnostico: DIAGNOSTICO, retroactivo: { id: 'x', meses_retroactivos_estimados: 6, conclusion_retroactivo: 'conviene' }, listas: { 'conveniencia-retroactivo': [{ pregunta: '¿Reduce tiempo para pensionarse?', respuesta: false }] } })
      expect(wrapper.findAll('input[name="conclusion_retroactivo"]').map(i => i.attributes('value'))).toEqual(['conviene', 'no_conviene', 'conviene_parcialmente', 'requiere_calculo_validacion'])
      expect((campo(wrapper, 'meses_retroactivos_estimados').element as HTMLInputElement).value).toBe('6')
      expect((radio(wrapper, 'retro-pregunta-1', 'false').element as HTMLInputElement).checked).toBe(true)
    })
  })

  describe('paso 8: escenarios y análisis financiero', () => {
    it('permite elegir como máximo 3 escenarios de los 8 sugeridos', async () => {
      const { wrapper } = await abrir(8, { diagnostico: DIAGNOSTICO })
      expect(wrapper.findAll('input[type="checkbox"][name^="escenario-"]')).toHaveLength(8)
      for (const k of ['base', 'm10', 'm40-media']) await marcar(wrapper, `escenario-${k}`)
      expect(wrapper.find('[data-escenarios-contador]').text()).toContain('3/3')
      expect(wrapper.find('input[name="escenario-mixto"]').attributes('disabled')).toBeDefined()
      expect(wrapper.find('input[name="escenario-m10"]').attributes('disabled')).toBeUndefined()
    })

    it('calcula pensión base, meses y años de recuperación y guarda cada escenario con su orden', async () => {
      const { wrapper, fetchMock } = await abrir(8, { diagnostico: DIAGNOSTICO })
      await marcar(wrapper, 'escenario-base')
      await marcar(wrapper, 'escenario-m10')
      await campo(wrapper, 'meses_modalidad_10').setValue('12')
      const col2 = () => wrapper.find('[data-escenario-col="2"]')
      await col2().find('input[name="semanas_proyectadas"]').setValue('1700')
      await col2().find('input[name="salario_promedio_proyectado"]').setValue('1800.50')
      await col2().find('input[name="inversion_total_estimada"]').setValue('24000')
      await col2().find('input[name="pension_mensual_estimada"]').setValue('12000')
      await col2().find('input[name="incremento_mensual"]').setValue('2000')
      expect(col2().find('[data-calculo="base"]').text()).toContain('10,000')
      expect(col2().find('[data-calculo="meses"]').text()).toContain('12')
      expect(col2().find('[data-calculo="anios"]').text()).toContain('1')

      await clic(wrapper, 'guardar')

      const posts = llamadas(fetchMock, 'POST', `${D}/escenarios`).map(([, o]) => o.body)
      expect(posts).toHaveLength(2)
      expect(posts[0]).toMatchObject({ nombre_escenario: 'Base: pensionarse sin estrategia adicional', orden: 1 })
      expect(posts[1]).toMatchObject({ nombre_escenario: 'Modalidad 10', orden: 2, meses_modalidad_10: 12, semanas_proyectadas: 1700, salario_promedio_proyectado: 1800.5, inversion_total_estimada: 24000, pension_mensual_estimada: 12000, incremento_mensual: 2000, meses_recuperacion_inversion: 12 })
    })

    it('al guardar de nuevo actualiza (PATCH) el escenario ya creado y no lo duplica', async () => {
      const { wrapper, fetchMock } = await abrir(8, { diagnostico: DIAGNOSTICO })
      await marcar(wrapper, 'escenario-base')
      await clic(wrapper, 'guardar')
      await wrapper.find('[data-escenario-col="1"] input[name="inversion_total_estimada"]').setValue('500')
      await clic(wrapper, 'guardar')
      expect(llamadas(fetchMock, 'POST', `${D}/escenarios`)).toHaveLength(1)
      expect(llamadas(fetchMock, 'PATCH', `${D}/escenarios/${fetchMock.bd.escenarios[0]!.id}`)).toHaveLength(1)
    })

    it('quitar un escenario guardado lo elimina', async () => {
      const esc = { id: 'e1', diagnostico_f1_id: DIAGNOSTICO.id, nombre_escenario: 'Modalidad 40 media', orden: 1, inversion_total_estimada: 0 }
      const { wrapper, fetchMock } = await abrir(8, { diagnostico: DIAGNOSTICO, escenarios: [esc] })
      expect((wrapper.find('input[name="escenario-m40-media"]').element as HTMLInputElement).checked).toBe(true)
      await wrapper.find('input[name="escenario-m40-media"]').setValue(false)
      await clic(wrapper, 'guardar')
      expect(llamadas(fetchMock, 'DELETE', `${D}/escenarios/e1`)).toHaveLength(1)
    })

    it('un escenario guardado con otro nombre aparece seleccionado y ocupa su orden: el nuevo toma el siguiente libre', async () => {
      const esc = { id: 'e9', diagnostico_f1_id: DIAGNOSTICO.id, nombre_escenario: 'Escenario personalizado', orden: 1, inversion_total_estimada: 0 }
      const { wrapper, fetchMock } = await abrir(8, { diagnostico: DIAGNOSTICO, escenarios: [esc] })
      expect((wrapper.find('input[name="escenario-extra-e9"]').element as HTMLInputElement).checked).toBe(true)
      expect(wrapper.find('[data-escenarios-contador]').text()).toContain('1/3')
      await marcar(wrapper, 'escenario-m10')
      await clic(wrapper, 'guardar')
      expect(cuerpo(fetchMock, 'POST', `${D}/escenarios`)).toMatchObject({ nombre_escenario: 'Modalidad 10', orden: 2 })
    })

    it('guarda la situación patrimonial, la conclusión financiera y una fila por hijo', async () => {
      const { wrapper, fetchMock } = await abrir(8, { diagnostico: DIAGNOSTICO })
      await campo(wrapper, 'saldo_cuenta_individual').setValue('250000')
      await campo(wrapper, 'aportaciones_voluntarias').setValue('1000.50')
      await campo(wrapper, 'bienes_patrimoniales').setValue('Casa propia')
      await campo(wrapper, 'estado_salud').setValue('regular')
      await campo(wrapper, 'estado_civil').setValue('casado')
      await campo(wrapper, 'edad_conyuge').setValue('60')
      await campo(wrapper, 'conclusion_financiera').setValue('Conviene Modalidad 40')
      await clic(wrapper, 'agregar-hijo')
      await clic(wrapper, 'agregar-hijo')
      const hijos = wrapper.findAll('[data-hijo]')
      await hijos[0]!.find('input[name="edad"]').setValue('15')
      await hijos[1]!.find('input[name="edad"]').setValue('9')
      await hijos[1]!.find('input[name="tiene_discapacidad"]').setValue(true)

      await clic(wrapper, 'guardar')

      expect(cuerpo(fetchMock, 'PUT', `${D}/situacion-patrimonial`)).toMatchObject({
        saldo_cuenta_individual: 250000, aportaciones_voluntarias: 1000.5, bienes_patrimoniales: 'Casa propia', estado_salud: 'regular', estado_civil: 'casado', edad_conyuge: 60,
      })
      expect(cuerpo(fetchMock, 'PATCH', D)).toMatchObject({ conclusion_financiera: 'Conviene Modalidad 40' })
      expect(cuerpo(fetchMock, 'PUT', `${D}/situacion-patrimonial/hijos`)).toEqual({ items: [{ edad: 15 }, { edad: 9, tiene_discapacidad: true }] })
      const orden = (fetchMock.mock.calls as Llamada[]).filter(([, o]) => o.method === 'PUT').map(([r]) => r)
      expect(orden.indexOf(`${D}/situacion-patrimonial`)).toBeLessThan(orden.indexOf(`${D}/situacion-patrimonial/hijos`))
    })

    it('muestra el número de hijos calculado y usa el estado civil del cliente si aún no hay registro', async () => {
      const { wrapper } = await abrir(8, { diagnostico: DIAGNOSTICO, listas: { 'situacion-patrimonial/hijos': [{ id: 'h1', edad: 5, tiene_discapacidad: false }] }, patrimonial: { id: 'p1', saldo_cuenta_individual: 10, estado_civil: null } })
      expect(wrapper.find('[data-total-hijos]').text()).toContain('1')
      expect((campo(wrapper, 'estado_civil').element as HTMLSelectElement).value).toBe(CLIENTE.estado_civil)
    })
  })

  describe('paso 9: recomendación, plan de acción y descarga', () => {
    it('Guardar envía la justificación, el siguiente paso y las estrategias (con "Otro")', async () => {
      const { wrapper, fetchMock } = await abrir(9, { diagnostico: DIAGNOSTICO })
      await marcar(wrapper, 'estrategias-5')
      await marcar(wrapper, 'estrategias-11')
      await campo(wrapper, 'estrategias-detalle-11').setValue('Esperar sentencia')
      await campo(wrapper, 'justificacion_estrategia').setValue('Mejora la pensión')
      await campo(wrapper, 'siguiente_paso_sugerido').setValue('Cita en el IMSS')

      await clic(wrapper, 'guardar')

      expect(cuerpo(fetchMock, 'PATCH', D)).toMatchObject({ justificacion_estrategia: 'Mejora la pensión', siguiente_paso_sugerido: 'Cita en el IMSS' })
      expect(cuerpo(fetchMock, 'PUT', `${D}/estrategias-recomendadas`)).toEqual({ items: [{ estrategia_id: 5 }, { estrategia_id: 11, detalle_otro: 'Esperar sentencia' }] })
    })

    it('el plan de acción crea, actualiza y elimina acciones', async () => {
      const accion = { id: 'p1', diagnostico_id: DIAGNOSTICO.id, accion: 'Pedir constancia', fecha_objetivo: '2026-12-01', estatus: 'pendiente', observaciones: null }
      const { wrapper, fetchMock } = await abrir(9, { diagnostico: DIAGNOSTICO, plan: [accion, { ...accion, id: 'p2', accion: 'Agendar cita' }] })
      expect(wrapper.findAll('[data-plan]')).toHaveLength(2)
      expect(wrapper.find('[data-plan] select[name="estatus"]').findAll('option').map(o => o.text())).toEqual(['Pendiente', 'En proceso', 'Hecho'])

      await wrapper.findAll('[data-plan]')[0]!.find('select[name="estatus"]').setValue('hecho')
      await wrapper.findAll('[data-plan]')[1]!.find('[data-accion="quitar-accion"]').trigger('click')
      await clic(wrapper, 'agregar-accion')
      const nueva = wrapper.findAll('[data-plan]')[1]!
      await nueva.find('input[name="accion"]').setValue('Reunir recibos')
      await nueva.find('input[name="fecha_objetivo"]').setValue('2026-12-15')
      await clic(wrapper, 'guardar')

      expect(cuerpo(fetchMock, 'PATCH', `${D}/plan-accion/p1`)).toEqual({ estatus: 'hecho' })
      expect(llamadas(fetchMock, 'DELETE', `${D}/plan-accion/p2`)).toHaveLength(1)
      expect(cuerpo(fetchMock, 'POST', `${D}/plan-accion`)).toEqual({ accion: 'Reunir recibos', fecha_objetivo: '2026-12-15', estatus: 'pendiente' })
    })

    it('una acción sin texto no se envía y se avisa', async () => {
      const { wrapper, fetchMock } = await abrir(9, { diagnostico: DIAGNOSTICO })
      await clic(wrapper, 'agregar-accion')
      await wrapper.find('[data-plan] input[name="observaciones"]').setValue('Solo una nota')
      await clic(wrapper, 'guardar')
      expect(wrapper.find('[data-plan]').text()).toMatch(/la acción es obligatoria/i)
      expect(llamadas(fetchMock, 'POST', `${D}/plan-accion`)).toHaveLength(0)
    })

    it('el último paso ofrece Descargar en lugar de Continuar y baja el PDF con el nombre de la cabecera', async () => {
      const { wrapper, fetchMock } = await abrir(9, { diagnostico: DIAGNOSTICO })
      expect(wrapper.find('button[data-accion="continuar"]').exists()).toBe(false)
      const guardados: string[] = []
      URL.createObjectURL = vi.fn(() => 'blob:f1')
      URL.revokeObjectURL = vi.fn()
      const clicEnlace = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { guardados.push(this.download) })

      await clic(wrapper, 'descargar-f1')

      const [ruta, opciones] = fetchMock.raw.mock.calls[0] as Llamada
      expect(ruta).toBe(`${D}/pdf`)
      expect(opciones.headers!.Authorization).toBe(`Bearer ${useSessionStore().token}`)
      expect(guardados).toEqual(['F1-cliente.pdf'])
      clicEnlace.mockRestore()
    })

    it('si el formato está incompleto (409) lista los campos que faltan', async () => {
      const { wrapper, fetchMock } = await abrir(9, { diagnostico: DIAGNOSTICO, pdf409: true })
      fetchMock.raw.mockImplementation(() => Promise.reject(errorHttp(409, { message: 'El diagnóstico F1 está incompleto: faltan 2 campos.', faltantes: [{ seccion: 'diagnostico', campo: 'cotizo_antes_julio_1997', etiqueta: '¿Cotizó antes del 1 de julio de 1997? (sección 3)' }, { seccion: 'diagnostico', campo: 'justificacion_estrategia', etiqueta: 'Justificación (sección 12)' }] })))

      await clic(wrapper, 'descargar-f1')

      const aviso = wrapper.find('[data-faltantes]')
      expect(aviso.exists()).toBe(true)
      expect(aviso.text()).toContain('faltan 2 campos')
      expect(aviso.text()).toContain('¿Cotizó antes del 1 de julio de 1997? (sección 3)')
      expect(aviso.text()).toContain('Justificación (sección 12)')
    })
  })
})
