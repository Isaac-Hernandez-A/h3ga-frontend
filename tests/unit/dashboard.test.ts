import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import InicioPage from '~/pages/index.vue'
import { fechaLarga } from '~/utils/dashboard'
import { hoyISO } from '~/utils/fechas'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'

const navegarMock = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => navegarMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

type Llamada = [string, { method: string, query?: Record<string, unknown> }]

const NOMBRES = ['Diagnóstico inicial', 'Diagnóstico especializado', 'Corrección de datos personales', 'Unificación de NSS', 'Aclaración/recuperación de semanas', 'Estrategia Modalidad 10', 'Estrategia Modalidad 40', 'Modalidad 40 retroactiva', 'IMSS-ISSSTE/doble pensión', 'Unificación AFORE/cuentas', 'SAR 92', 'Solicitud de pensión', 'Negativa de pensión', 'Juicio/Jurisdicción', 'Cobranza final', 'Finalización']
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()
const porEtapa = (cuenta: Record<number, number>) => NOMBRES.map((nombre, numero_paso) => ({ numero_paso, nombre, clientes: cuenta[numero_paso] ?? 0 }))

const accion = (cliente: string, asesor: string, paso: number, accion: string, estado: string, fecha = hoyISO()) =>
  ({ cliente_id: `c-${cliente}`, cliente_nombre: cliente, asesor_id: `as-${asesor}`, asesor_nombre: asesor, numero_paso: paso, etapa: NOMBRES[paso], fecha_compromiso: fecha, accion_a_realizar: accion, estado })
const pendiente = (id: string, cliente: string, tipo: string, estatus: string, subidoPor: string, subidoPorId: string) =>
  ({ documento_id: id, cliente_id: `c-${cliente}`, cliente_nombre: cliente, tipo_documento_id: 1, tipo_documento: tipo, estatus, fecha_carga: hace(3), subido_por_id: subidoPorId, subido_por_nombre: subidoPor, etapa_actual: 'Corrección de datos personales' })
const detenido = (cliente: string, asesor: string, etapa: string, estatus: string | null, dias: number) =>
  ({ cliente_id: `c-${cliente}`, cliente_nombre: cliente, asesor_id: `as-${asesor}`, asesor_nombre: asesor, etapa_actual: etapa, estatus_id: estatus ? 9 : 3, estatus, ultima_actividad: hace(dias), dias_sin_actividad: dias })

const base = {
  fecha: hoyISO(),
  resumen: { clientes_activos: 2, clientes_pensionados: 0, asesores_activos: null, acciones_proximas_mes: 1, documentos_por_confirmar: 1, documentos_con_observaciones: 1, clientes_avance_detenido: 1 },
  clientes_por_etapa: porEtapa({ 1: 1, 2: 1 }),
  documentos_por_estatus: { si: 0, por_confirmar: 1, no: 1 },
  acciones_del_mes: [accion('María Elena Rodríguez Salas', 'Ana Pérez', 1, 'Entregar constancia', 'proxima')],
  total_acciones_del_mes: 1,
  documentos_pendientes: [
    pendiente('d1', 'María Elena Rodríguez Salas', 'Acta de Nacimiento', 'por_confirmar', 'Carlos Montes', 'as-B'),
    pendiente('d2', 'José Ángel Núñez', 'INE', 'no', 'Ana Pérez', SESION_API.usuario.id),
  ],
  total_documentos_pendientes: 2,
  clientes_detenidos: [detenido('José Ángel Núñez', 'Ana Pérez', 'Corrección de datos personales', 'Detenido', 1)],
  carga_por_asesor: null,
}
const RESPUESTAS: Record<Rol, unknown> = {
  asesor: base,
  auxiliar: base,
  supervisor: {
    ...base,
    resumen: { ...base.resumen, clientes_activos: 3, clientes_pensionados: 1, asesores_activos: 3, clientes_avance_detenido: 2 },
    clientes_por_etapa: porEtapa({ 1: 1, 2: 1, 4: 1 }),
    acciones_del_mes: [
      accion('Iván Torres', 'Carlos Montes', 4, 'Subir acta', 'completada'),
      accion('María Elena Rodríguez Salas', 'Ana Pérez', 1, 'Entregar constancia', 'proxima'),
    ],
    total_acciones_del_mes: 2,
    clientes_detenidos: [
      detenido('Iván Torres', 'Carlos Montes', 'Estrategia Modalidad 10', null, 20),
      detenido('José Ángel Núñez', 'Ana Pérez', 'Corrección de datos personales', 'Detenido', 1),
    ],
    carga_por_asesor: [
      { asesor_id: 'as-A', asesor_nombre: 'Ana Pérez', clientes_activos: 2, clientes_detenidos: 1, clientes_pensionados: 0 },
      { asesor_id: 'as-B', asesor_nombre: 'Carlos Montes', clientes_activos: 1, clientes_detenidos: 1, clientes_pensionados: 1 },
    ],
  },
}

function api(rol: Rol, falla = false, respuesta: unknown = RESPUESTAS[rol]) {
  return stubFetch((ruta) => {
    const r = ruta as string
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
    if (r === '/dashboard') return falla ? Promise.reject(errorHttp(500, { message: 'Error' })) : Promise.resolve(JSON.parse(JSON.stringify(respuesta)))
    // Nada más: el resumen ya viene calculado, con nombres y alcance por rol.
    return Promise.reject(errorHttp(404, { message: `sin simular: ${r}` }))
  })
}

async function abrir(rol: Rol, falla = false, respuesta?: unknown) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  const fetchMock = api(rol, falla, respuesta ?? RESPUESTAS[rol])
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

  it('"Inicio" no rebota a Clientes: muestra el dashboard', async () => {
    await abrir('asesor')
    expect(navegarMock).not.toHaveBeenCalled()
  })

  it('arma todo con una sola petición a GET /dashboard (sin leer clientes, etapas, documentos ni usuarios)', async () => {
    const { fetchMock } = await abrir('supervisor')
    const llamadas = (fetchMock.mock.calls as Llamada[]).filter(([r]) => r !== '/auth/login')
    expect(llamadas.map(([r, o]) => `${o.method} ${r}`)).toEqual(['GET /dashboard'])
    expect(llamadas[0]![1].query).toEqual({ limite: 50 })
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
      expect(f[0]!.text()).toContain('Detenido')
      expect(f[0]!.find('[data-dias]').text()).toBe('1 día')
      expect(f[0]!.find('[data-asesor]').exists()).toBe(false)
      expect(wrapper.find('[data-seccion="detenidos"]').text()).not.toMatch(/asesor/i)
    })

    it('junto a los documentos pendientes muestra la dona de documentos por estatus', async () => {
      const { wrapper } = await abrir('asesor')
      const dona = wrapper.find('[data-dona="documentos"]')
      expect(dona.exists()).toBe(true)
      expect(dona.text()).toContain('2')
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
      expect(f[0]!.find('a[data-accion="revisar"]').attributes('href')).toBe('/clientes/c-María Elena Rodríguez Salas/archivos')
    })

    it('no muestra las secciones de carga por asesor', async () => {
      const { wrapper } = await abrir('asesor')
      for (const s of ['carga-grafica', 'carga-tabla']) expect(wrapper.find(`[data-seccion="${s}"]`).exists(), s).toBe(false)
    })

    it('Refrescar vuelve a pedir el resumen', async () => {
      const { wrapper, fetchMock } = await abrir('asesor')
      const pedidos = () => (fetchMock.mock.calls as [string][]).filter(([r]) => r === '/dashboard').length
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
      expect(f.map(x => x.find('[data-subido-por]').text())).toEqual(['Carlos Montes', 'Tú'])
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

    it('no muestra la columna de asesor', async () => {
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
      expect(tarjeta(wrapper, 'detenidos').text()).toBe('2')
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

    it('clientes con avance detenido incluye al asesor y respeta el orden del backend (más días primero)', async () => {
      const { wrapper } = await abrir('supervisor')
      const f = filas(wrapper, 'detenidos', 'data-detenido-fila')
      expect(f).toHaveLength(2)
      expect(f[0]!.find('[data-dias]').text()).toBe('20 días')
      expect(f[0]!.find('[data-asesor]').text()).toBe('Carlos Montes')
    })
  })

  it('si no se puede cargar el resumen muestra un error con reintentar', async () => {
    const { wrapper } = await abrir('asesor', true)
    expect(wrapper.find('[role="alert"]').text()).toMatch(/no se pudo cargar el dashboard/i)
    expect(wrapper.find('button[data-accion="reintentar"]').exists()).toBe(true)
  })

  it('sin clientes activos lo dice en vez de mostrar gráficas vacías', async () => {
    const vacio = { ...base, resumen: { ...base.resumen, clientes_activos: 0, acciones_proximas_mes: 0, documentos_por_confirmar: 0, documentos_con_observaciones: 0, clientes_avance_detenido: 0 }, clientes_por_etapa: porEtapa({}), acciones_del_mes: [], documentos_pendientes: [], clientes_detenidos: [] }
    const { wrapper } = await abrir('asesor', false, vacio)
    expect(wrapper.text()).toMatch(/aún no tienes clientes activos/i)
  })
})
