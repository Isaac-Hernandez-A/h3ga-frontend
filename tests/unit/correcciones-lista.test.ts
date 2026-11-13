import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ListaPage from '~/pages/correcciones/index.vue'
import { formatearActualizado } from '~/utils/correcciones'
import { SESION_API, errorHttp, stubFetch } from './ayudas'

const navegarMock = vi.hoisted(() => vi.fn())
mockNuxtImport('navigateTo', () => navegarMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()
// El backend entrega solo clientes que requieren alguna fase; cada fase dice si se requiere y cómo va.
const f2 = (correcciones: number | null) => ({ numero_paso: 2, etapa_tramite_id: 'e2', estatus_id: 4, estatus: 'En proceso asesor', avance_porcentaje: 30, fecha_compromiso: null, accion_a_realizar: null, requiere: correcciones !== null, correcciones, documentos_cargados: null })
const f3 = (docs: number | null) => ({ numero_paso: 3, etapa_tramite_id: 'e3', estatus_id: 2, estatus: 'Por iniciar', avance_porcentaje: 10, fecha_compromiso: null, accion_a_realizar: null, requiere: docs !== null, correcciones: null, documentos_cargados: docs ?? 0 })
const f4 = (docs: number | null) => ({ numero_paso: 4, etapa_tramite_id: 'e4', estatus_id: 2, estatus: 'Por iniciar', avance_porcentaje: 10, fecha_compromiso: null, accion_a_realizar: null, requiere: docs !== null, correcciones: null, documentos_cargados: docs ?? 0 })
const cliente = (n: string, nombre: string, actualizado: string, a: number | null, b: number | null, c: number | null) =>
  ({ cliente_id: `c-${n}`, cliente_nombre: nombre, actualizado_el: actualizado, fases: [f2(a), f3(b), f4(c)] })

const CLIENTES_LISTA = [
  cliente('1', 'Luis Fernando Navarro Beltrán', hace(0), 2, null, 1),
  cliente('2', 'Gabriela Ibarra Fuentes', hace(2), null, 0, 0),
  cliente('3', 'Ricardo Domínguez Lara', hace(10), 1, 1, null),
  cliente('4', 'Héctor Manuel Castillo Pérez', hace(100), 3, null, null),
]
const RESUMEN = { clientes_con_correcciones: 4, documentos_por_subir: 2 }

function api(clientes = CLIENTES_LISTA, resumen = RESUMEN, falla = false) {
  return stubFetch((ruta) => {
    const r = ruta as string
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API })
    if (r === '/correcciones') return falla ? Promise.reject(errorHttp(500, { message: 'Error' })) : Promise.resolve({ resumen: { ...resumen }, clientes: clientes.map(c => ({ ...c, fases: c.fases.map(f => ({ ...f })) })) })
    if (r === '/avisos') return Promise.resolve([])
    return Promise.reject(errorHttp(404, { message: `sin simular: ${r}` }))
  })
}

async function abrir(clientes = CLIENTES_LISTA, resumen = RESUMEN, falla = false) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  const fetchMock = api(clientes, resumen, falla)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const wrapper = await mountSuspended(ListaPage)
  await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando los clientes con correcciones/i), { timeout: 4000 })
  return { wrapper, fetchMock }
}
type Pagina = Awaited<ReturnType<typeof abrir>>['wrapper']
const filas = (w: Pagina) => w.findAll('[data-tramite]')
const nombres = (w: Pagina) => filas(w).map(f => f.find('[data-nombre]').text())

describe('formatearActualizado', () => {
  it('"Hoy, 01:15 PM", "Ayer, 10:30 AM" o la fecha', () => {
    const ahora = new Date(2026, 10, 12, 15, 0)
    expect(formatearActualizado(new Date(2026, 10, 12, 13, 15).toISOString(), ahora)).toBe('Hoy, 01:15 PM')
    expect(formatearActualizado(new Date(2026, 10, 11, 10, 30).toISOString(), ahora)).toBe('Ayer, 10:30 AM')
    expect(formatearActualizado(new Date(2026, 9, 5, 9, 0).toISOString(), ahora)).toBe('05/10/2026')
  })
})

describe('Correcciones: lista de clientes con correcciones', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navegarMock.mockReset()
  })

  it('pide la lista con una sola petición a GET /correcciones', async () => {
    const { fetchMock } = await abrir()
    const llamadas = (fetchMock.mock.calls as [string, { method: string }][]).filter(([r]) => r !== '/auth/login' && r !== '/avisos')
    expect(llamadas.map(([r, o]) => `${o.method} ${r}`)).toEqual(['GET /correcciones'])
  })

  it('la tarjeta dice cuántos documentos faltan por subir y en cuántos clientes con correcciones (lo calcula el backend)', async () => {
    const { wrapper } = await abrir()
    const t = wrapper.find('[data-documentos-por-subir]')
    expect(t.text()).toContain('2')
    expect(t.text()).toMatch(/documentos por subir/i)
    expect(t.text()).toMatch(/4 clientes con correcciones/)
  })

  it('una fila por cliente (los que requieren alguna fase) con su nombre y cuándo se actualizó', async () => {
    const { wrapper } = await abrir()
    expect(nombres(wrapper)).toEqual(['Luis Fernando Navarro Beltrán', 'Gabriela Ibarra Fuentes', 'Ricardo Domínguez Lara', 'Héctor Manuel Castillo Pérez'])
    expect(filas(wrapper)[0]!.find('[data-actualizado]').text()).toMatch(/^Hoy, \d{2}:\d{2} (AM|PM)$/)
  })

  it('cada fase dice "No requiere", cuántas correcciones tiene (F2) o si falta el documento (F3 y F4)', async () => {
    const { wrapper } = await abrir()
    const luis = filas(wrapper)[0]!
    expect(luis.find('[data-fase="f2"]').text()).toBe('2 correcciones')
    expect(luis.find('[data-fase="f3"]').text()).toBe('No requiere')
    expect(luis.find('[data-fase="f4"]').text()).toBe('1 documento cargado')
    expect(luis.find('[data-fase="f4"] [data-pastilla]').attributes('data-estado')).toBe('cargado')

    const gabriela = filas(wrapper)[1]!
    expect(gabriela.find('[data-fase="f2"]').text()).toBe('No requiere')
    expect(gabriela.find('[data-fase="f3"]').text()).toBe('Falta documento')
    expect(gabriela.find('[data-fase="f3"] [data-pastilla]').attributes('data-estado')).toBe('falta')
    expect(filas(wrapper)[3]!.find('[data-fase="f2"]').text()).toBe('3 correcciones')
    expect(filas(wrapper)[2]!.find('[data-fase="f2"]').text()).toBe('1 corrección')
  })

  it('"Gestionar" abre el detalle del cliente', async () => {
    const { wrapper } = await abrir()
    await filas(wrapper)[1]!.find('[data-accion="gestionar"]').trigger('click')
    expect(navegarMock).toHaveBeenCalledWith('/correcciones/c-2')
  })

  describe('filtros', () => {
    it('buscar por nombre (sin acentos ni mayúsculas)', async () => {
      const { wrapper } = await abrir()
      await wrapper.find('input[name="buscar"]').setValue('dominguez')
      expect(nombres(wrapper)).toEqual(['Ricardo Domínguez Lara'])
    })

    it('ordenar por actualización más antigua', async () => {
      const { wrapper } = await abrir()
      await wrapper.find('select[name="orden"]').setValue('antiguo')
      expect(nombres(wrapper)[0]).toBe('Héctor Manuel Castillo Pérez')
    })

    it('filtrar por fase deja a los clientes que la requieren', async () => {
      const { wrapper } = await abrir()
      await wrapper.find('select[name="filtro-fase"]').setValue('f3')
      expect(nombres(wrapper)).toEqual(['Gabriela Ibarra Fuentes', 'Ricardo Domínguez Lara'])
      await wrapper.find('select[name="filtro-fase"]').setValue('f2')
      expect(nombres(wrapper)).toEqual(['Luis Fernando Navarro Beltrán', 'Ricardo Domínguez Lara', 'Héctor Manuel Castillo Pérez'])
    })

    it('filtrar por documentos: los que les falta subir uno, o ya lo tienen (en F3 y F4, o en la fase elegida)', async () => {
      const { wrapper } = await abrir()
      await wrapper.find('select[name="filtro-documentos"]').setValue('falta')
      expect(nombres(wrapper)).toEqual(['Gabriela Ibarra Fuentes'])
      await wrapper.find('select[name="filtro-documentos"]').setValue('cargado')
      expect(nombres(wrapper)).toEqual(['Luis Fernando Navarro Beltrán', 'Ricardo Domínguez Lara'])
      await wrapper.find('select[name="filtro-fase"]').setValue('f4')
      expect(nombres(wrapper)).toEqual(['Luis Fernando Navarro Beltrán'])
    })

    it('"Últimos 90 días" oculta lo actualizado antes y "Limpiar filtros" lo devuelve todo', async () => {
      const { wrapper } = await abrir()
      await wrapper.find('button[data-accion="ultimos-dias"]').trigger('click')
      expect(nombres(wrapper)).toEqual(['Luis Fernando Navarro Beltrán', 'Gabriela Ibarra Fuentes', 'Ricardo Domínguez Lara'])
      await wrapper.find('button[data-accion="limpiar-filtros"]').trigger('click')
      expect(filas(wrapper)).toHaveLength(4)
    })

    it('si nada coincide lo dice', async () => {
      const { wrapper } = await abrir()
      await wrapper.find('input[name="buscar"]').setValue('zzzz')
      expect(wrapper.text()).toMatch(/no hay clientes que coincidan/i)
    })
  })

  it('pagina de 10 en 10', async () => {
    const muchos = Array.from({ length: 23 }, (_, i) => cliente(String(i + 10), `Cliente ${String(i + 10)}`, hace(i), 1, null, null))
    const { wrapper } = await abrir(muchos, { clientes_con_correcciones: 23, documentos_por_subir: 0 })
    expect(filas(wrapper)).toHaveLength(10)
    await wrapper.findAll('[data-pagina]')[2]!.trigger('click')
    await vi.waitFor(() => expect(filas(wrapper)).toHaveLength(3))
  })

  it('sin clientes que requieran correcciones lo dice', async () => {
    const { wrapper } = await abrir([], { clientes_con_correcciones: 0, documentos_por_subir: 0 })
    expect(wrapper.text()).toMatch(/ningún cliente requiere correcciones/i)
  })

  it('si falla la carga muestra un error con reintentar', async () => {
    const { wrapper } = await abrir(CLIENTES_LISTA, RESUMEN, true)
    expect(wrapper.find('[role="alert"]').text()).toMatch(/no se pudieron cargar los clientes con correcciones/i)
    expect(wrapper.find('button[data-accion="reintentar"]').exists()).toBe(true)
  })
})
