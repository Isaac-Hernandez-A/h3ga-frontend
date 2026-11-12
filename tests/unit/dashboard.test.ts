import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import InicioPage from '~/pages/index.vue'
import { fechaLarga } from '~/utils/dashboard'
import { hoyISO } from '~/utils/fechas'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { ASESOR_A, ASESOR_B, CLIENTES, USUARIOS_SUPERVISOR } from './clientes-datos'
import { ESTATUS, TIPOS_DOCUMENTO, enDiasISO } from './expediente-datos'

const navegarMock = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => navegarMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

const NOMBRES = ['Diagnóstico inicial', 'Diagnóstico especializado', 'Corrección de datos personales', 'Unificación de NSS', 'Aclaración/recuperación de semanas', 'Estrategia Modalidad 10', 'Estrategia Modalidad 40', 'Modalidad 40 retroactiva', 'IMSS-ISSSTE/doble pensión', 'Unificación AFORE/cuentas', 'SAR 92', 'Solicitud de pensión', 'Negativa de pensión', 'Juicio/Jurisdicción', 'Cobranza final', 'Finalización']
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()

function etapasDe(clienteId: string, cambios: Record<number, Record<string, unknown>>, actualizado = hace(1)) {
  const etapas = NOMBRES.map((nombre, paso) => ({
    numero_paso: paso, nombre, id: `${clienteId}-e${paso}`, cliente_id: clienteId, etapa_id: paso + 1, estatus_id: 2, avance_porcentaje: 10,
    accion_a_realizar: null, fecha_compromiso: null, fecha_completada: null, reactivado_en: null, creado_el: actualizado, actualizado_el: actualizado, motivo_rechazo: null,
    ...cambios[paso],
  }))
  return { avance_global: 10, etapas }
}
const [C1, C2, C3, C4] = CLIENTES.map(c => c.id) as [string, string, string, string]
const ETAPAS: Record<string, unknown> = {
  [C1]: etapasDe(C1, { 1: { estatus_id: 4, fecha_compromiso: enDiasISO(0), accion_a_realizar: 'Entregar constancia' } }),
  [C2]: etapasDe(C2, { 4: { estatus_id: 6, fecha_compromiso: enDiasISO(0), fecha_completada: enDiasISO(0), accion_a_realizar: 'Subir acta' }, 5: { estatus_id: 3 } }, hace(20)),
  [C3]: etapasDe(C3, { 2: { estatus_id: 9 } }),
  [C4]: etapasDe(C4, { 15: { estatus_id: 6 } }),
}
const doc = (id: string, clienteId: string, estatus: string, tipo = 1, subidoPor = ASESOR_A) => ({ id, cliente_id: clienteId, tipo_documento_id: tipo, archivo_path: 'x', nombre_archivo_original: `${id}.pdf`, mime_type: 'application/pdf', estatus, numero_referencia: null, fecha_carga: hace(3), subido_por: subidoPor, observaciones: null })
const DOCS: Record<string, unknown[]> = {
  [C1]: [doc('d1', C1, 'por_confirmar', 1, ASESOR_B)],
  [C2]: [doc('d3', C2, 'si', 2)],
  [C3]: [doc('d2', C3, 'no', 3, SESION_API.usuario.id)],
  [C4]: [doc('d4', C4, 'por_confirmar')],
}

function api(rol: Rol, falla = false) {
  // El backend entrega a cada rol solo sus clientes: el Asesor y el Auxiliar ven C1 y C3.
  const visibles = rol === 'supervisor' ? CLIENTES : CLIENTES.filter(c => c.id === C1 || c.id === C3)
  return stubFetch((ruta) => {
    const r = ruta as string
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
    if (r === '/clientes') return falla ? Promise.reject(errorHttp(500, { message: 'Error' })) : Promise.resolve(visibles.map(c => ({ ...c })))
    const etapas = r.match(/^\/clientes\/([^/]+)\/etapas$/)
    if (etapas) return Promise.resolve(ETAPAS[etapas[1]!])
    const docs = r.match(/^\/clientes\/([^/]+)\/documentos$/)
    if (docs) return Promise.resolve(DOCS[docs[1]!])
    if (r === '/catalogos/tipos-documento') return Promise.resolve(TIPOS_DOCUMENTO)
    if (r === '/catalogos/estatus') return Promise.resolve(ESTATUS)
    if (r === '/usuarios') return rol === 'supervisor' ? Promise.resolve(USUARIOS_SUPERVISOR) : Promise.reject(errorHttp(403, { message: 'No' }))
    if (r === '/avisos' || r === '/agenda') return Promise.resolve([])
    return Promise.reject(errorHttp(404, { message: `sin simular: ${r}` }))
  })
}

async function abrir(rol: Rol, falla = false) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  const fetchMock = api(rol, falla)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const wrapper = await mountSuspended(InicioPage)
  await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando el dashboard/i), { timeout: 4000 })
  return { wrapper, fetchMock }
}
type Pagina = Awaited<ReturnType<typeof abrir>>['wrapper']
const tarjeta = (w: Pagina, k: string) => w.find(`[data-tarjeta="${k}"] [data-valor]`)
const filas = (w: Pagina, seccion: string, fila: string) => w.findAll(`[data-seccion="${seccion}"] [${fila}]`)

describe('Dashboard de Inicio', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navegarMock.mockReset()
  })

  it('saluda por el nombre y muestra la fecha de hoy', async () => {
    const { wrapper } = await abrir('asesor')
    expect(wrapper.find('[data-saludo]').text()).toBe('Hola, Ana!')
    expect(wrapper.find('[data-fecha-hoy]').text()).toBe(fechaLarga(hoyISO()))
  })

  it('"Inicio" ya no rebota a Clientes: muestra el dashboard', async () => {
    await abrir('asesor')
    expect(navegarMock).not.toHaveBeenCalled()
  })

  describe('Asesor', () => {
    it('tarjetas: clientes activos, acciones próximas del mes, documentos pendientes y clientes con avance detenido', async () => {
      const { wrapper } = await abrir('asesor')
      expect(tarjeta(wrapper, 'clientes').text()).toBe('2')
      expect(tarjeta(wrapper, 'acciones').text()).toBe('1')
      expect(tarjeta(wrapper, 'documentos').text()).toBe('1') // solo "Por confirmar": el "Con observaciones" ya se revisó
      expect(tarjeta(wrapper, 'detenidos').text()).toBe('1')
      expect(wrapper.find('[data-tarjeta="asesores"]').exists()).toBe(false)
    })

    it('muestra la tabla de clientes con avance detenido, sin la columna de asesor', async () => {
      const { wrapper } = await abrir('asesor')
      const f = filas(wrapper, 'detenidos', 'data-detenido-fila')
      expect(f).toHaveLength(1)
      expect(f[0]!.text()).toContain('Corrección de datos personales')
      expect(f[0]!.find('[data-dias]').text()).toBe('1 día')
      expect(f[0]!.find('[data-asesor]').exists()).toBe(false)
      expect(wrapper.find('[data-seccion="detenidos"]').text()).not.toMatch(/asesor/i)
    })

    it('junto a los documentos pendientes muestra la dona de documentos por estatus', async () => {
      const { wrapper } = await abrir('asesor')
      const dona = wrapper.find('[data-dona="documentos"]')
      expect(dona.exists()).toBe(true)
      expect(dona.text()).toContain('2') // los dos documentos de sus clientes activos
      expect(dona.findAll('[data-leyenda]').map(l => l.text())[1]).toContain('Por confirmar')
    })

    it('acciones y fechas próximas del mes, con cliente, fecha, etapa, acción y estado', async () => {
      const { wrapper } = await abrir('asesor')
      const f = filas(wrapper, 'acciones', 'data-accion-fila')
      expect(f).toHaveLength(1)
      expect(f[0]!.text()).toContain('María Elena Rodríguez Salas')
      expect(f[0]!.text()).toContain('Diagnóstico especializado')
      expect(f[0]!.text()).toContain('Entregar constancia')
      expect(f[0]!.find('[data-estado-accion]').text()).toBe('Hoy')
    })

    it('clientes por etapa: 16 barras (una por etapa, con 0 incluidas) y la dona por grupo de etapas', async () => {
      const { wrapper } = await abrir('asesor')
      const barras = filas(wrapper, 'etapas', 'data-barra')
      expect(barras).toHaveLength(16)
      expect(barras[1]!.text()).toContain('1 Diagnóstico especializado')
      expect(barras[1]!.find('[data-valor-barra]').text()).toBe('1')
      expect(barras[0]!.find('[data-valor-barra]').text()).toBe('0')
      expect(wrapper.find('[data-dona="etapas"]').text()).toContain('2')
      const leyenda = wrapper.findAll('[data-dona="etapas"] [data-leyenda]').map(l => l.text())
      expect(leyenda[0]).toContain('Diagnóstico y correcciones')
      expect(leyenda[0]).toContain('100%')
      expect(leyenda).toHaveLength(4)
      expect(wrapper.find('[data-seccion="etapas"]').text()).toMatch(/2 clientes activos en 16 etapas/)
    })

    it('documentos pendientes: solo "Por confirmar", con el tipo, la fecha de carga y "Revisar" al archivo del cliente', async () => {
      const { wrapper } = await abrir('asesor')
      const f = filas(wrapper, 'documentos', 'data-documento-fila')
      expect(f).toHaveLength(1)
      expect(f[0]!.text()).toContain('Acta de Nacimiento')
      expect(f[0]!.find('a[data-accion="revisar"]').attributes('href')).toBe(`/clientes/${C1}/archivos`)
    })

    it('no muestra las secciones de carga por asesor', async () => {
      const { wrapper } = await abrir('asesor')
      for (const s of ['carga-grafica', 'carga-tabla']) expect(wrapper.find(`[data-seccion="${s}"]`).exists(), s).toBe(false)
    })

    it('Refrescar vuelve a pedir los datos', async () => {
      const { wrapper, fetchMock } = await abrir('asesor')
      const pedidos = () => (fetchMock.mock.calls as [string][]).filter(([r]) => r === '/clientes').length
      expect(pedidos()).toBe(1)
      await wrapper.find('button[data-accion="refrescar"]').trigger('click')
      await flushPromises()
      await vi.waitFor(() => expect(pedidos()).toBe(2))
    })
  })

  describe('Auxiliar', () => {
    it('tarjetas: clientes activos, acciones, documentos pendientes de revisión y clientes con avance detenido', async () => {
      const { wrapper } = await abrir('auxiliar')
      expect(tarjeta(wrapper, 'clientes').text()).toBe('2')
      expect(tarjeta(wrapper, 'acciones').text()).toBe('1')
      expect(tarjeta(wrapper, 'documentos').text()).toBe('2') // por confirmar y con observaciones
      expect(tarjeta(wrapper, 'detenidos').text()).toBe('1')
    })

    it('documentos pendientes o no válidos: incluye con observaciones y quién lo subió', async () => {
      const { wrapper } = await abrir('auxiliar')
      const f = filas(wrapper, 'documentos', 'data-documento-fila')
      expect(f).toHaveLength(2)
      expect(f.map(x => x.find('[data-revision]').text())).toEqual(['Pendiente', 'No validado'])
      expect(f.map(x => x.find('[data-subido-por]').text())).toEqual(['Auxiliar', 'Tú'])
    })

    it('documentos por estatus en una dona con conteo y porcentaje', async () => {
      const { wrapper } = await abrir('auxiliar')
      const dona = wrapper.find('[data-dona="documentos"]')
      expect(dona.text()).toContain('2')
      const leyenda = dona.findAll('[data-leyenda]').map(l => l.text())
      expect(leyenda).toHaveLength(3)
      expect(leyenda[0]).toContain('Aprobados')
      expect(leyenda[1]).toContain('Por confirmar')
      expect(leyenda[1]).toContain('50%')
      expect(leyenda[2]).toContain('Con observaciones')
    })

    it('clientes con avance detenido: etapa, estatus, última actividad y días sin actividad', async () => {
      const { wrapper } = await abrir('auxiliar')
      const f = filas(wrapper, 'detenidos', 'data-detenido-fila')
      expect(f).toHaveLength(1)
      expect(f[0]!.text()).toContain('Corrección de datos personales')
      expect(f[0]!.text()).toContain('Detenido')
      expect(f[0]!.find('[data-dias]').text()).toBe('1 día')
    })

    it('no muestra la columna de asesor: el Auxiliar no puede leer los usuarios', async () => {
      const { wrapper } = await abrir('auxiliar')
      expect(wrapper.find('[data-seccion="acciones"] [data-columna-asesor]').exists()).toBe(false)
    })
  })

  describe('Supervisor', () => {
    it('tarjetas: clientes activos, asesores activos, acciones próximas y clientes con avance detenido', async () => {
      const { wrapper } = await abrir('supervisor')
      expect(tarjeta(wrapper, 'clientes').text()).toBe('3')
      expect(tarjeta(wrapper, 'asesores').text()).toBe('3')
      expect(tarjeta(wrapper, 'acciones').text()).toBe('1')
      expect(tarjeta(wrapper, 'detenidos').text()).toBe('2') // una etapa detenida y otro con 20 días sin actividad
      expect(wrapper.find('[data-tarjeta="documentos"]').exists()).toBe(false)
    })

    it('las acciones del mes muestran el asesor de cada cliente y la completada', async () => {
      const { wrapper } = await abrir('supervisor')
      const f = filas(wrapper, 'acciones', 'data-accion-fila')
      expect(f).toHaveLength(2)
      expect(f.map(x => x.find('[data-estado-accion]').text()).sort()).toEqual(['Completada', 'Hoy'])
      expect(f.find(x => x.text().includes('Iván'))!.find('[data-asesor]').text()).toBe('Carlos Montes')
    })

    it('carga de trabajo por asesor: solo la tabla (sin gráfica) con activos, detenidos, pensionados y total', async () => {
      const { wrapper } = await abrir('supervisor')
      expect(wrapper.find('[data-seccion="carga-grafica"]').exists()).toBe(false)
      const f = filas(wrapper, 'carga-tabla', 'data-carga-fila')
      const celdas = (el: { findAll: (s: string) => { text: () => string }[] }) => el.findAll('td').map(td => td.text())
      expect(f.map(celdas)).toEqual([['Ana Pérez', '2', '1', '0'], ['Carlos Montes', '1', '1', '1']])
      expect(celdas(wrapper.find('[data-seccion="carga-tabla"] [data-carga-total]'))).toEqual(['Total', '3', '2', '1'])
    })

    it('clientes con avance detenido incluye al asesor y ordena por días sin actividad', async () => {
      const { wrapper } = await abrir('supervisor')
      const f = filas(wrapper, 'detenidos', 'data-detenido-fila')
      expect(f).toHaveLength(2)
      expect(f[0]!.find('[data-dias]').text()).toBe('20 días')
      expect(f[0]!.find('[data-asesor]').text()).toBe('Carlos Montes')
    })
  })

  it('si no se pueden cargar los clientes muestra un error con reintentar', async () => {
    const { wrapper } = await abrir('asesor', true)
    expect(wrapper.find('[role="alert"]').text()).toMatch(/no se pudo cargar el dashboard/i)
    expect(wrapper.find('button[data-accion="reintentar"]').exists()).toBe(true)
  })

  it('sin clientes lo dice en vez de mostrar gráficas vacías', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    stubFetch((ruta) => ruta === '/auth/login' ? Promise.resolve({ ...SESION_API }) : ruta === '/clientes' ? Promise.resolve([]) : Promise.resolve([]))
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const wrapper = await mountSuspended(InicioPage)
    await vi.waitFor(() => expect(wrapper.text()).toMatch(/aún no tienes clientes activos/i))
  })
})
