import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ArchivosPage from '~/pages/clientes/[id]/archivos.vue'
import { formatearFechaCorta } from '~/utils/fechas'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { AFORES, LEYES, REGIMENES, USUARIOS_SUPERVISOR } from './clientes-datos'
import { CLIENTE, DOCUMENTOS, ESTATUS, RESPUESTA_ETAPAS, TIPOS_DOCUMENTO } from './expediente-datos'

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

type Llamada = [string, { method: string, body?: unknown, headers?: Record<string, string>, responseType?: string }]

function api(rol: Rol = 'asesor', documentos: unknown[] = DOCUMENTOS) {
  const lista = documentos.map(d => ({ ...(d as object) }))
  const mock = stubFetch((ruta, opciones) => {
    const r = ruta as string
    const { method } = opciones as Llamada[1]
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
    if (r === `/clientes/${CLIENTE.id}`) return Promise.resolve(CLIENTE)
    if (r === `/clientes/${CLIENTE.id}/etapas`) return Promise.resolve(RESPUESTA_ETAPAS)
    // Cada respuesta es una copia, como la de una API real.
    if (r === `/clientes/${CLIENTE.id}/documentos` && method === 'GET') return Promise.resolve(lista.map(d => ({ ...d })))
    if (r === `/clientes/${CLIENTE.id}/documentos` && method === 'POST') {
      const nuevo = { ...DOCUMENTOS[0]!, id: 'd9999999-0000-4000-8000-000000000009', nombre_archivo_original: 'Nuevo archivo.pdf', fecha_carga: '2026-11-11T12:00:00.000Z' }
      lista.push(nuevo)
      return Promise.resolve(nuevo)
    }
    if (r === '/catalogos/tipos-documento') return Promise.resolve(TIPOS_DOCUMENTO)
    if (r === '/catalogos/estatus') return Promise.resolve(ESTATUS)
    if (r === '/catalogos/regimenes') return Promise.resolve(REGIMENES)
    if (r === '/catalogos/leyes-probables') return Promise.resolve(LEYES)
    if (r === '/catalogos/afores') return Promise.resolve(AFORES)
    if (r === '/usuarios') return Promise.resolve(USUARIOS_SUPERVISOR)
    if (r === '/agenda' || r === '/avisos') return Promise.resolve([])
    return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))
  })
  // $fetch.raw: la descarga de archivos.
  ;(mock as unknown as { raw: unknown }).raw = vi.fn(() =>
    Promise.resolve({ headers: new Headers({ 'content-disposition': "attachment; filename*=UTF-8''Constancia%20de%20semanas.pdf" }), _data: new Blob(['%PDF-1.4']) }),
  )
  return mock as typeof mock & { raw: ReturnType<typeof vi.fn> }
}

async function abrir(rol: Rol = 'asesor', documentos: unknown[] = DOCUMENTOS) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  rutaMock.params.id = CLIENTE.id
  const fetchMock = api(rol, documentos)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const wrapper = await mountSuspended(ArchivosPage)
  await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando/i))
  return { wrapper, fetchMock }
}
const filas = (w: Awaited<ReturnType<typeof abrir>>['wrapper']) => w.findAll('tbody tr')
const subidas = (m: ReturnType<typeof api>) => (m.mock.calls as Llamada[]).filter(([ruta, o]) => o.method === 'POST' && ruta === `/clientes/${CLIENTE.id}/documentos`)
const enDocumento = (selector: string) => document.body.querySelector<HTMLElement>(selector)

describe('Archivos del cliente (ver archivos)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    document.body.innerHTML = ''
  })

  it('muestra el perfil del cliente y la tabla de documentos con nombre, fecha, tipo y estatus', async () => {
    const { wrapper } = await abrir()

    expect(wrapper.find('[data-perfil-nombre]').text()).toBe('María Elena Rodríguez Salas')
    expect(filas(wrapper)).toHaveLength(3)
    const primera = filas(wrapper).find(f => f.text().includes('Constancia de semanas cotizadas.pdf'))!
    expect(primera.text()).toContain('Acta de Nacimiento')
    expect(primera.text()).toContain(formatearFechaCorta('2026-10-01'))
    expect(primera.text()).toContain('Por confirmar')
    expect(filas(wrapper).find(f => f.text().includes('Baja del régimen'))!.text()).toContain('Aprobado')
    expect(filas(wrapper).find(f => f.text().includes('Identificación'))!.text()).toContain('Con observaciones')
  })

  it('busca por nombre de archivo, filtra por tipo y por rango de fechas, y limpia los filtros', async () => {
    const { wrapper } = await abrir()

    await wrapper.find('input[type="search"]').setValue('IDENTIFICACION')
    expect(filas(wrapper)).toHaveLength(1)
    await wrapper.find('input[type="search"]').setValue('')

    await wrapper.find('select[name="filtro-tipo"]').setValue('2')
    expect(filas(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('Baja del régimen')
    await wrapper.find('select[name="filtro-tipo"]').setValue('')

    await wrapper.find('input[name="desde"]').setValue('2026-10-04')
    await wrapper.find('input[name="hasta"]').setValue('2026-10-10')
    expect(filas(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('Baja del régimen')

    await wrapper.find('button[data-accion="limpiar-filtros"]').trigger('click')
    expect(filas(wrapper)).toHaveLength(3)
  })

  it('sin documentos lo dice, y con filtros sin resultados también', async () => {
    const vacio = await abrir('asesor', [])
    expect(vacio.wrapper.text()).toMatch(/aún no hay documentos/i)
    vacio.wrapper.unmount()

    const { wrapper } = await abrir()
    await wrapper.find('input[type="search"]').setValue('zzz')
    expect(wrapper.text()).toMatch(/no hay documentos que coincidan/i)
  })

  it('descargar pide el archivo con el token y lo guarda con el nombre de Content-Disposition (CF-13)', async () => {
    const { wrapper, fetchMock } = await abrir()
    const guardados: string[] = []
    URL.createObjectURL = vi.fn(() => 'blob:prueba')
    URL.revokeObjectURL = vi.fn()
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { guardados.push(this.download) })

    await filas(wrapper).find(f => f.text().includes('Constancia de semanas cotizadas.pdf'))!.find('button[data-accion="descargar"]').trigger('click')
    await flushPromises()

    const [ruta, opciones] = fetchMock.raw.mock.calls[0] as Llamada
    expect(ruta).toBe(`/clientes/${CLIENTE.id}/documentos/${DOCUMENTOS[0]!.id}/descargar`)
    expect(opciones.headers!.Authorization).toBe(`Bearer ${useSessionStore().token}`)
    expect(opciones.responseType).toBe('blob')
    expect(guardados).toEqual(['Constancia de semanas.pdf'])
    clic.mockRestore()
  })

  it('"Añadir documento" lo ven el Asesor y el Auxiliar, pero no el Supervisor', async () => {
    for (const [rol, esperado] of [['asesor', true], ['auxiliar', true], ['supervisor', false]] as const) {
      const { wrapper } = await abrir(rol)
      expect(wrapper.find('button[data-accion="anadir"]').exists(), rol).toBe(esperado)
      wrapper.unmount()
    }
  })

  describe('subir un documento', () => {
    async function abrirModal() {
      const base = await abrir()
      await base.wrapper.find('button[data-accion="anadir"]').trigger('click')
      await vi.waitFor(() => expect(enDocumento('select[name="tipo_documento_id"]')).not.toBeNull())
      const poner = async (selector: string, valor: string) => {
        const el = enDocumento(selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        el.value = valor
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
        await flushPromises()
      }
      const elegirArchivo = async (archivo: File) => {
        const input = enDocumento('input[name="archivo"]') as HTMLInputElement
        Object.defineProperty(input, 'files', { value: [archivo], configurable: true })
        input.dispatchEvent(new Event('change', { bubbles: true }))
        await flushPromises()
      }
      const confirmar = async () => {
        enDocumento('button[data-accion="confirmar-subir"]')!.click()
        await flushPromises()
      }
      return { ...base, poner, elegirArchivo, confirmar }
    }

    it('valida tipo de documento y archivo antes de enviar', async () => {
      const { fetchMock, confirmar } = await abrirModal()

      await confirmar()

      expect(document.body.textContent).toMatch(/elige el tipo de documento/i)
      expect(document.body.textContent).toMatch(/elige un archivo/i)
      expect(subidas(fetchMock)).toHaveLength(0)
    })

    it('rechaza en el navegador un tipo distinto de PDF, JPG o PNG y un archivo de más de 10 MB', async () => {
      const { fetchMock, poner, elegirArchivo, confirmar } = await abrirModal()
      await poner('select[name="tipo_documento_id"]', '1')

      await elegirArchivo(new File(['x'], 'hoja.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
      await confirmar()
      expect(document.body.textContent).toMatch(/solo se aceptan pdf, jpg o png/i)

      await elegirArchivo(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.pdf', { type: 'application/pdf' }))
      await confirmar()
      expect(document.body.textContent).toMatch(/no debe pesar más de 10 mb/i)
      expect(subidas(fetchMock)).toHaveLength(0)
    })

    it('envía multipart a POST /clientes/{id}/documentos con tipo, archivo, referencia y observaciones, y agrega el documento a la tabla', async () => {
      const { wrapper, fetchMock, poner, elegirArchivo, confirmar } = await abrirModal()
      await poner('select[name="tipo_documento_id"]', '3')
      await poner('input[name="numero_referencia"]', 'REF-123')
      await poner('textarea[name="observaciones"]', 'Frente y vuelta')
      await elegirArchivo(new File(['%PDF-1.4'], 'Nuevo archivo.pdf', { type: 'application/pdf' }))

      await confirmar()

      const [ruta, opciones] = subidas(fetchMock)[0]!
      expect(ruta).toBe(`/clientes/${CLIENTE.id}/documentos`)
      expect(opciones.body).toBeInstanceOf(FormData)
      const datos = opciones.body as FormData
      expect(datos.get('tipo_documento_id')).toBe('3')
      expect(datos.get('numero_referencia')).toBe('REF-123')
      expect(datos.get('observaciones')).toBe('Frente y vuelta')
      expect((datos.get('archivo') as File).name).toBe('Nuevo archivo.pdf')
      expect(opciones.headers!['Content-Type']).toBeUndefined()
      await vi.waitFor(() => expect(filas(wrapper)).toHaveLength(4))
      expect(wrapper.text()).toContain('Nuevo archivo.pdf')
    })

    it('un error del servidor al subir se muestra en el formulario y no cierra el modal', async () => {
      const { fetchMock, poner, elegirArchivo, confirmar } = await abrirModal()
      const original = fetchMock.getMockImplementation()!
      fetchMock.mockImplementation((ruta, opciones) =>
        (opciones as Llamada[1]).method === 'POST' ? Promise.reject(errorHttp(400, { message: 'Solo se aceptan archivos PDF, JPG o PNG.' })) : original(ruta, opciones))
      await poner('select[name="tipo_documento_id"]', '1')
      await elegirArchivo(new File(['x'], 'a.pdf', { type: 'application/pdf' }))

      await confirmar()

      expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('Solo se aceptan archivos PDF, JPG o PNG.')
      expect(enDocumento('select[name="tipo_documento_id"]')).not.toBeNull()
    })
  })

  it('si falla la carga de los documentos muestra un error con reintentar', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    rutaMock.params.id = CLIENTE.id
    const base = api()
    stubFetch((ruta, opciones) => {
      if (ruta === `/clientes/${CLIENTE.id}/documentos`) return Promise.reject(errorHttp(500, { message: 'Error interno del servidor' }))
      return (base as unknown as (...a: unknown[]) => unknown)(ruta, opciones)
    })
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')

    const wrapper = await mountSuspended(ArchivosPage)
    await vi.waitFor(() => expect(wrapper.text()).toMatch(/no se pudieron cargar los documentos/i))

    expect(wrapper.find('button[data-accion="reintentar"]').exists()).toBe(true)
  })

  it('el botón "Regresar" vuelve al expediente', async () => {
    const { wrapper } = await abrir()

    expect(wrapper.find('a[data-accion="regresar"]').attributes('href')).toBe(`/clientes/${CLIENTE.id}`)
  })
})
