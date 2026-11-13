import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ReportesPage from '~/pages/reportes/index.vue'
import { hoyISO } from '~/utils/fechas'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'

// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch() (también su variante .raw).
mockNuxtImport('$fetch', () => {
  const g = globalThis as unknown as { $fetch: ((...a: unknown[]) => unknown) & { raw: (...a: unknown[]) => unknown } }
  return Object.assign((...args: unknown[]) => g.$fetch(...args), { raw: (...args: unknown[]) => g.$fetch.raw(...args) })
})
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

type Llamada = [string, { method: string, query?: Record<string, unknown>, headers?: Record<string, string> }]

const ESTATUS = ['No aplica', 'Por iniciar', 'En proceso cliente', 'En proceso asesor', 'En proceso Instituto', 'Finalizado', 'Bloqueado', 'Cancelado', 'Detenido']
const NOMBRES = ['Diagnóstico inicial', 'Diagnóstico especializado', 'Corrección de datos personales', 'Unificación de NSS', 'Aclaración/recuperación de semanas']
const fila = (paso: number, cuenta: Record<string, number>) => ({
  numero_paso: paso, nombre: NOMBRES[paso]!, total: Object.values(cuenta).reduce((a, b) => a + b, 0),
  por_estatus: Object.fromEntries(ESTATUS.map(e => [e, cuenta[e] ?? 0])),
})

const REPORTE = {
  periodo: 'semanal', desde: '2026-11-09', hasta: '2026-11-15', hoy: '2026-11-12', alcance: 'asesor',
  cartera: {
    estatus: ESTATUS,
    etapas: [
      fila(0, { 'Por iniciar': 1, Finalizado: 1 }),
      fila(1, { 'Por iniciar': 1, Finalizado: 1 }),
      fila(2, { 'Por iniciar': 1, 'En proceso cliente': 1 }),
      fila(3, { 'Por iniciar': 1, Finalizado: 1, Bloqueado: 1 }),
      fila(4, { 'Por iniciar': 2 }),
    ],
  },
  finalizados: {
    total: 3,
    lista: [
      { numero_paso: 3, etapa: 'Unificación de NSS', cliente: 'María Elena Rodríguez Salas', fecha_completada: '2026-11-12' },
      { numero_paso: 0, etapa: 'Diagnóstico inicial', cliente: 'María Elena Rodríguez Salas', fecha_completada: '2026-11-11' },
      { numero_paso: 1, etapa: 'Diagnóstico especializado', cliente: 'José Ángel Núñez', fecha_completada: '2026-11-11' },
    ],
  },
  vencimientos: {
    vencidos: 1, por_vencer: 2,
    lista: [
      { numero_paso: 2, etapa: 'Corrección de datos personales', cliente: 'José Ángel Núñez', fecha_compromiso: '2026-11-10', situacion: 'vencido' },
      { numero_paso: 4, etapa: 'Aclaración/recuperación de semanas', cliente: 'María Elena Rodríguez Salas', fecha_compromiso: '2026-11-14', situacion: 'por_vencer' },
    ],
  },
  rechazo: { tasa: 0.25, bloqueos: 1, etapas_con_cambios: 4, motivos: [{ motivo: 'Falta el acta de nacimiento', total: 1 }] },
  clientes_nuevos: { total: 3, por_regimen: [{ regimen: 'IMSS', total: 2 }, { regimen: 'ISSSTE', total: 1 }] },
  trazabilidad: {
    total: 14,
    lista: [
      { cliente: 'María Elena Rodríguez Salas', numero_paso: 3, etapa: 'Unificación de NSS', estatus_anterior: 'En proceso asesor', estatus_nuevo: 'Finalizado', fecha: '2026-11-12', asesor: 'Ana Pérez' },
      { cliente: 'José Ángel Núñez', numero_paso: 0, etapa: 'Diagnóstico inicial', estatus_anterior: null, estatus_nuevo: 'Por iniciar', fecha: '2026-11-10', asesor: 'Carlos Montes' },
    ],
  },
}
const POR_ASESOR = [
  { asesor_id: 'a1', asesor: 'Ana Pérez', clientes: 2, avance_promedio: 44.5 },
  { asesor_id: 'a2', asesor: 'Carlos Montes', clientes: 1, avance_promedio: 20 },
]

function api(rol: Rol, reporte: unknown = REPORTE, falla = false) {
  const mock = stubFetch((ruta, o) => {
    const r = ruta as string
    const { query } = (o ?? {}) as Llamada[1]
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
    if (r === '/reportes') {
      if (falla) return Promise.reject(errorHttp(500, { message: 'Error' }))
      const copia = JSON.parse(JSON.stringify(reporte)) as Record<string, unknown>
      return Promise.resolve({ ...copia, periodo: query?.periodo })
    }
    if (r === '/avisos') return Promise.resolve([])
    return Promise.reject(errorHttp(404, { message: `sin simular: ${r}` }))
  })
  ;(mock as unknown as { raw: unknown }).raw = vi.fn(() =>
    Promise.resolve({ headers: new Headers({ 'content-disposition': 'attachment; filename="Reporte-operativo-mensual-2026-10-01.pdf"' }), _data: new Blob(['%PDF-1.4']) }),
  )
  return mock as typeof mock & { raw: ReturnType<typeof vi.fn> }
}

async function abrir(rol: Rol = 'asesor', reporte: unknown = REPORTE, falla = false) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  const fetchMock = api(rol, reporte, falla)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const wrapper = await mountSuspended(ReportesPage)
  await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando el reporte/i), { timeout: 4000 })
  return { wrapper, fetchMock }
}
type Pagina = Awaited<ReturnType<typeof abrir>>['wrapper']
const pedidos = (m: ReturnType<typeof api>) => (m.mock.calls as Llamada[]).filter(([r]) => r === '/reportes').map(([, o]) => o.query)
const valor = (w: Pagina, k: string) => w.find(`[data-tarjeta="${k}"] [data-valor]`).text()
const filas = (w: Pagina, seccion: string, fila: string) => w.findAll(`[data-seccion="${seccion}"] [${fila}]`)

describe('Reportes', () => {
  beforeEach(() => sessionStorage.clear())

  describe('consulta', () => {
    it('al abrir pide el reporte semanal de hoy', async () => {
      const { fetchMock } = await abrir()
      expect(pedidos(fetchMock)).toEqual([{ periodo: 'semanal', fecha: hoyISO() }])
    })

    it('el selector arma la consulta con periodo y fecha (cada cambio vuelve a pedir el reporte)', async () => {
      const { wrapper, fetchMock } = await abrir()
      await wrapper.find('select[name="periodo"]').setValue('mensual')
      await vi.waitFor(() => expect(pedidos(fetchMock)).toHaveLength(2))
      await wrapper.find('input[name="fecha"]').setValue('2026-10-05')
      await vi.waitFor(() => expect(pedidos(fetchMock)).toHaveLength(3))
      expect(pedidos(fetchMock)).toEqual([
        { periodo: 'semanal', fecha: hoyISO() },
        { periodo: 'mensual', fecha: hoyISO() },
        { periodo: 'mensual', fecha: '2026-10-05' },
      ])
    })

    it('si se borra la fecha no pide nada hasta que haya una válida', async () => {
      const { wrapper, fetchMock } = await abrir()
      await wrapper.find('input[name="fecha"]').setValue('')
      await flushPromises()
      expect(pedidos(fetchMock)).toHaveLength(1)
    })

    it('el selector "Periodo de reporte" ofrece semanal, mensual y trimestral', async () => {
      const { wrapper } = await abrir()
      const selector = wrapper.find('select[aria-label="Periodo de reporte"]')
      expect(selector.findAll('option').map(o => o.attributes('value'))).toEqual(['semanal', 'mensual', 'trimestral'])
      expect(selector.findAll('option').map(o => o.text())).toEqual(['Semanal', 'Mensual', 'Trimestral'])
    })

    it('al elegir trimestral pide el reporte trimestral y el PDF usa el mismo periodo', async () => {
      const { wrapper, fetchMock } = await abrir()
      URL.createObjectURL = vi.fn(() => 'blob:reporte')
      URL.revokeObjectURL = vi.fn()
      const clicEnlace = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
      await wrapper.find('select[name="periodo"]').setValue('trimestral')
      await vi.waitFor(() => expect(pedidos(fetchMock)).toHaveLength(2))
      expect(pedidos(fetchMock)[1]).toEqual({ periodo: 'trimestral', fecha: hoyISO() })

      await wrapper.find('button[data-accion="exportar-pdf"]').trigger('click')
      await vi.waitFor(() => expect(fetchMock.raw).toHaveBeenCalled())
      expect((fetchMock.raw.mock.calls[0] as [string])[0]).toBe(`/reportes/pdf?periodo=trimestral&fecha=${hoyISO()}`)
      clicEnlace.mockRestore()
    })

    it('muestra el rango que cubre el reporte', async () => {
      const { wrapper } = await abrir()
      expect(wrapper.find('[data-rango]').text()).toContain('09/11/2026')
      expect(wrapper.find('[data-rango]').text()).toContain('15/11/2026')
    })
  })

  describe('secciones', () => {
    it('tarjetas: etapas finalizadas, vencidas, por vencer y clientes nuevos', async () => {
      const { wrapper } = await abrir()
      expect(valor(wrapper, 'finalizadas')).toBe('3')
      expect(valor(wrapper, 'vencidas')).toBe('1')
      expect(valor(wrapper, 'por-vencer')).toBe('2')
      expect(valor(wrapper, 'nuevos')).toBe('3')
    })

    it('cartera: una fila por etapa (0 a 4) con su total y un tramo por cada estatus con clientes', async () => {
      const { wrapper } = await abrir()
      const f = filas(wrapper, 'cartera', 'data-etapa-fila')
      expect(f).toHaveLength(5)
      expect(f[0]!.text()).toContain('Diagnóstico inicial')
      expect(f[3]!.findAll('[data-segmento]').map(s => s.attributes('title'))).toEqual(['Por iniciar: 1', 'Finalizado: 1', 'Bloqueado: 1'])
      expect(f[4]!.findAll('[data-segmento]')).toHaveLength(1)
    })

    it('cartera: la dona suma las etapas por estatus y la leyenda no lista los estatus en cero', async () => {
      const { wrapper } = await abrir()
      const dona = wrapper.find('[data-dona="cartera"]')
      expect(dona.text()).toContain('11') // total de etapas (2+2+2+3+2)
      const leyenda = dona.findAll('[data-leyenda]').map(l => l.text())
      expect(leyenda).toHaveLength(4) // Por iniciar, En proceso cliente, Finalizado, Bloqueado
      expect(leyenda[0]).toContain('Por iniciar')
      expect(leyenda[0]).toContain('6')
    })

    it('finalizadas: cliente, etapa y fecha de cada una', async () => {
      const { wrapper } = await abrir()
      const f = filas(wrapper, 'finalizados', 'data-finalizado-fila')
      expect(f).toHaveLength(3)
      expect(f[0]!.text()).toContain('María Elena Rodríguez Salas')
      expect(f[0]!.text()).toContain('Unificación de NSS')
      expect(f[0]!.text()).toContain('12/11/2026')
    })

    it('vencidos y por vencer: cada compromiso con su situación', async () => {
      const { wrapper } = await abrir()
      const f = filas(wrapper, 'vencimientos', 'data-vencimiento-fila')
      expect(f.map(x => x.find('[data-situacion]').text())).toEqual(['Vencido', 'Por vencer'])
      expect(f[0]!.text()).toContain('José Ángel Núñez')
      expect(f[0]!.text()).toContain('10/11/2026')
    })

    it('rechazo: la tasa en porcentaje, los bloqueos sobre las etapas con cambios y los motivos', async () => {
      const { wrapper } = await abrir()
      const s = wrapper.find('[data-seccion="rechazo"]')
      expect(s.find('[data-tasa]').text()).toBe('25%')
      expect(s.text()).toMatch(/1 bloqueo.*4 etapas/)
      expect(filas(wrapper, 'rechazo', 'data-motivo-fila').map(x => x.text())).toEqual([expect.stringContaining('Falta el acta de nacimiento')])
    })

    it('clientes nuevos por régimen', async () => {
      const { wrapper } = await abrir()
      const barras = filas(wrapper, 'nuevos', 'data-barra')
      expect(barras.map(b => b.text())).toEqual([expect.stringContaining('IMSS'), expect.stringContaining('ISSSTE')])
      expect(barras[0]!.find('[data-valor-barra]').text()).toBe('2')
    })

    it('trazabilidad de etapas: etapa y cliente, cambio de estatus, fecha y asesor (sin columna de respuesta)', async () => {
      const { wrapper } = await abrir()
      const s = wrapper.find('[data-seccion="trazabilidad"]')
      expect(s.findAll('th').map(th => th.text())).toEqual(['Etapa', 'Cambio de estatus', 'Fecha', 'Asesor'])
      expect(s.text()).not.toMatch(/respuesta/i)
      const f = filas(wrapper, 'trazabilidad', 'data-cambio-fila')
      expect(f).toHaveLength(2)
      expect(f[0]!.text()).toContain('Unificación de NSS')
      expect(f[0]!.text()).toContain('María Elena Rodríguez Salas')
      expect(f[0]!.find('[data-estatus-anterior]').text()).toBe('En proceso asesor')
      expect(f[0]!.find('[data-estatus-nuevo]').text()).toBe('Finalizado')
      expect(f[0]!.text()).toContain('12/11/2026')
      expect(f[0]!.text()).toContain('Ana Pérez')
    })

    it('trazabilidad: sin estatus anterior (primer registro) muestra solo el nuevo, y avisa cuántos cambios hubo en total', async () => {
      const { wrapper } = await abrir()
      const f = filas(wrapper, 'trazabilidad', 'data-cambio-fila')
      expect(f[1]!.find('[data-estatus-anterior]').exists()).toBe(false)
      expect(f[1]!.find('[data-estatus-nuevo]').text()).toBe('Por iniciar')
      expect(wrapper.find('[data-seccion="trazabilidad"]').text()).toMatch(/2 de 14 cambios/)
    })

    it('las listas vacías dicen que no hay nada en el periodo en vez de mostrar tablas vacías', async () => {
      const vacio = {
        ...REPORTE,
        finalizados: { total: 0, lista: [] },
        vencimientos: { vencidos: 0, por_vencer: 0, lista: [] },
        rechazo: { tasa: 0, bloqueos: 0, etapas_con_cambios: 0, motivos: [] },
        clientes_nuevos: { total: 0, por_regimen: [] },
        trazabilidad: { total: 0, lista: [] },
      }
      const { wrapper } = await abrir('asesor', vacio)
      for (const s of ['finalizados', 'vencimientos', 'rechazo', 'nuevos', 'trazabilidad']) {
        expect(wrapper.find(`[data-seccion="${s}"] table`).exists(), s).toBe(false)
        expect(wrapper.find(`[data-seccion="${s}"]`).text(), s).toMatch(/sin |no hubo|no hay|ning/i)
      }
    })
  })

  describe('desglose por asesor', () => {
    it('no aparece si la respuesta no trae por_asesor (Asesor)', async () => {
      const { wrapper } = await abrir('asesor')
      expect(wrapper.find('[data-seccion="por-asesor"]').exists()).toBe(false)
    })

    it('aparece si la respuesta lo trae (Supervisor): asesor, clientes y avance promedio', async () => {
      const { wrapper } = await abrir('supervisor', { ...REPORTE, alcance: 'supervisor', por_asesor: POR_ASESOR })
      const f = filas(wrapper, 'por-asesor', 'data-asesor-fila')
      expect(f.map(x => x.findAll('td').map(td => td.text()))).toEqual([['Ana Pérez', '2', '44.5%'], ['Carlos Montes', '1', '20%']])
    })
  })

  describe('PDF', () => {
    it('la descarga del PDF usa el mismo periodo y fecha que la vista', async () => {
      const { wrapper, fetchMock } = await abrir()
      const guardados: string[] = []
      URL.createObjectURL = vi.fn(() => 'blob:reporte')
      URL.revokeObjectURL = vi.fn()
      const clicEnlace = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { guardados.push(this.download) })
      await wrapper.find('select[name="periodo"]').setValue('mensual')
      await wrapper.find('input[name="fecha"]').setValue('2026-10-05')
      await flushPromises()

      await wrapper.find('button[data-accion="exportar-pdf"]').trigger('click')
      await vi.waitFor(() => expect(fetchMock.raw).toHaveBeenCalled())

      const [ruta, opciones] = fetchMock.raw.mock.calls[0] as [string, Llamada[1]]
      expect(ruta).toBe('/reportes/pdf?periodo=mensual&fecha=2026-10-05')
      expect(opciones.headers!.Authorization).toBe(`Bearer ${useSessionStore().token}`)
      await vi.waitFor(() => expect(guardados).toEqual(['Reporte-operativo-mensual-2026-10-01.pdf']))
      clicEnlace.mockRestore()
    })

    it('no ofrece el PDF mientras no haya una fecha válida', async () => {
      const { wrapper } = await abrir()
      await wrapper.find('input[name="fecha"]').setValue('')
      expect(wrapper.find('button[data-accion="exportar-pdf"]').attributes('disabled')).toBeDefined()
    })
  })

  it('si no se puede cargar el reporte muestra un error con reintentar', async () => {
    const { wrapper, fetchMock } = await abrir('asesor', REPORTE, true)
    expect(wrapper.find('[role="alert"]').text()).toMatch(/no se pudo cargar el reporte/i)
    await wrapper.find('button[data-accion="reintentar"]').trigger('click')
    await vi.waitFor(() => expect(pedidos(fetchMock)).toHaveLength(2))
  })
})
