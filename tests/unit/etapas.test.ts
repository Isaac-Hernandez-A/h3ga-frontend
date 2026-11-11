import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import CambioEstatusFormulario from '~/components/CambioEstatusFormulario.vue'
import HistorialEtapa from '~/components/HistorialEtapa.vue'
import ExpedientePage from '~/pages/clientes/[id]/index.vue'
import { useEtapas } from '~/composables/useEtapas'
import { formatearFechaHora } from '~/utils/fechas'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { AFORES, LEYES, REGIMENES, USUARIOS_SUPERVISOR } from './clientes-datos'
import { CLIENTE, DOCUMENTOS, ESTATUS, ETAPAS, RESPUESTA_ETAPAS } from './expediente-datos'

const { navigateToMock, rutaMock } = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return { navigateToMock: vi.fn(), rutaMock: reactive({ params: { id: '' }, path: '', query: {}, meta: {} as Record<string, unknown> }) }
})
mockNuxtImport('navigateTo', () => navigateToMock)
mockNuxtImport('useRoute', () => () => rutaMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

type Llamada = [string, { method: string, body?: Record<string, unknown> }]

const etapa = (paso: number) => ETAPAS[paso]! // 1: En proceso asesor 60%, 5: En proceso Instituto 40%, 6: Bloqueado, 0: Finalizado, 2: Por iniciar
const rutaEtapa = (paso: number) => `/clientes/${CLIENTE.id}/etapas/${etapa(paso).id}`

async function iniciarSesion(rol: Rol = 'asesor') {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  stubFetch(() => Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } }))
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
}

describe('useEtapas', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('usa las rutas de etapas, cambio de estatus e historial del backend', async () => {
    await iniciarSesion()
    const fetchMock = stubFetch(() => Promise.resolve([]))
    const etapas = useEtapas(CLIENTE.id)

    await etapas.listar()
    await etapas.cambiarEstatus('e1', { estatus_id: 6 })
    await etapas.historial('e1')

    const registro = (fetchMock.mock.calls as Llamada[]).map(([ruta, o]) => `${o.method} ${ruta} ${JSON.stringify(o.body ?? null)}`)
    expect(registro).toEqual([
      `GET /clientes/${CLIENTE.id}/etapas null`,
      `PATCH /clientes/${CLIENTE.id}/etapas/e1 {"estatus_id":6}`,
      `GET /clientes/${CLIENTE.id}/etapas/e1/historial null`,
    ])
  })
})

describe('CambioEstatusFormulario', () => {
  beforeEach(async () => {
    sessionStorage.clear()
    await iniciarSesion()
  })

  async function abrir(paso = 1) {
    const wrapper = await mountSuspended(CambioEstatusFormulario, { props: { clienteId: CLIENTE.id, etapa: etapa(paso), estatus: ESTATUS } })
    const campo = (nombre: string) => wrapper.find(`[name="${nombre}"]`)
    return {
      wrapper,
      campo,
      enviar: async () => {
        await wrapper.find('form').trigger('submit')
        await flushPromises()
      },
    }
  }

  it('lista los estatus del catálogo con el actual preseleccionado y el avance actual', async () => {
    const { campo } = await abrir(1)

    expect(campo('estatus_id').text()).toContain('En proceso Instituto')
    expect(campo('estatus_id').text()).toContain('Bloqueado')
    expect((campo('estatus_id').element as HTMLSelectElement).value).toBe('4')
    expect((campo('avance_porcentaje').element as HTMLInputElement).value).toBe('60')
  })

  it('el campo de avance solo aparece en los estatus "En proceso" y el de motivo solo en Bloqueado', async () => {
    const { wrapper, campo } = await abrir(1)

    await campo('estatus_id').setValue('6')
    expect(wrapper.find('[name="avance_porcentaje"]').exists()).toBe(false)
    expect(wrapper.find('[name="motivo_rechazo"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('100%')

    await campo('estatus_id').setValue('7')
    expect(wrapper.find('[name="avance_porcentaje"]').exists()).toBe(false)
    expect(wrapper.find('[name="motivo_rechazo"]').exists()).toBe(true)

    await campo('estatus_id').setValue('2')
    expect(wrapper.find('[name="avance_porcentaje"]').exists()).toBe(false)
    expect(wrapper.find('[name="motivo_rechazo"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('10%')

    await campo('estatus_id').setValue('3')
    expect(wrapper.find('[name="avance_porcentaje"]').exists()).toBe(true)
  })

  it('CF-09 Bloqueado exige motivo', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(etapa(6)))
    const { wrapper, campo, enviar } = await abrir(1)
    await campo('estatus_id').setValue('7')

    await enviar()
    expect(wrapper.text()).toMatch(/indica el motivo del bloqueo/i)
    expect(fetchMock).not.toHaveBeenCalled()

    await campo('motivo_rechazo').setValue('Falta la constancia')
    await enviar()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('CF-09 En proceso acepta de 20 a 90 y rechaza fuera de rango, vacío o con decimales', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(etapa(1)))
    const { wrapper, campo, enviar } = await abrir(1)

    for (const invalido of ['19', '91', '', 'abc', '45.5', '-30']) {
      await campo('avance_porcentaje').setValue(invalido)
      await enviar()
      expect(wrapper.text(), `"${invalido}"`).toMatch(/entre 20 y 90/i)
    }
    expect(fetchMock).not.toHaveBeenCalled()

    for (const valido of ['20', '90', '55']) {
      fetchMock.mockClear()
      await campo('avance_porcentaje').setValue(valido)
      await enviar()
      expect(fetchMock, valido).toHaveBeenCalledTimes(1)
    }
  })

  it('CF-09 Finalizado no pide avance: envía solo el estatus', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(etapa(0)))
    const { campo, enviar, wrapper } = await abrir(1)
    await campo('estatus_id').setValue('6')

    await enviar()

    const [ruta, opciones] = fetchMock.mock.calls[0] as Llamada
    expect(ruta).toBe(rutaEtapa(1))
    expect(opciones.method).toBe('PATCH')
    expect(opciones.body).toEqual({ estatus_id: 6 })
    expect(wrapper.emitted('cambiado')).toHaveLength(1)
  })

  it('al pasar a En proceso desde una etapa sin avance válido propone el mínimo (20)', async () => {
    const { campo } = await abrir(2) // Por iniciar, avance 10

    await campo('estatus_id').setValue('3')

    expect((campo('avance_porcentaje').element as HTMLInputElement).value).toBe('20')
  })

  it('envía estatus, avance, acción y fecha compromiso cuando se llenan; sin motivo si no es Bloqueado', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(etapa(1)))
    const { campo, enviar } = await abrir(1)
    await campo('estatus_id').setValue('5')
    await campo('avance_porcentaje').setValue('70')
    await campo('accion_a_realizar').setValue('Entregar constancia')
    await campo('fecha_compromiso').setValue('2026-12-01')

    await enviar()

    const [, opciones] = fetchMock.mock.calls[0] as Llamada
    expect(opciones.body).toEqual({ estatus_id: 5, avance_porcentaje: 70, accion_a_realizar: 'Entregar constancia', fecha_compromiso: '2026-12-01' })
  })

  it('Bloqueado envía el motivo y no el avance', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(etapa(6)))
    const { campo, enviar } = await abrir(1)
    await campo('estatus_id').setValue('7')
    await campo('motivo_rechazo').setValue('Falta la constancia')

    await enviar()

    const [, opciones] = fetchMock.mock.calls[0] as Llamada
    expect(opciones.body).toEqual({ estatus_id: 7, motivo_rechazo: 'Falta la constancia' })
  })

  it('si el backend rechaza el cambio, muestra el error y avisa para recargar los datos en vez de dejarlos viejos', async () => {
    stubFetch(() => Promise.reject(errorHttp(400, { message: 'En "En proceso asesor" el avance debe ser un entero entre 20 y 90.' })))
    const { wrapper, campo, enviar } = await abrir(1)
    await campo('avance_porcentaje').setValue('50')

    await enviar()

    expect(wrapper.find('[role="alert"]').text()).toContain('entre 20 y 90')
    expect(wrapper.emitted('recargar')).toHaveLength(1)
    expect(wrapper.emitted('cambiado')).toBeUndefined()
  })

  it('un error inesperado también recarga y muestra un mensaje general', async () => {
    stubFetch(() => Promise.reject(errorHttp(500, { message: 'Error interno del servidor' })))
    const { wrapper, enviar } = await abrir(1)

    await enviar()

    expect(wrapper.find('[role="alert"]').text()).toMatch(/no se pudo guardar/i)
    expect(wrapper.emitted('recargar')).toHaveLength(1)
  })

  it('cancelar avisa sin llamar a la API', async () => {
    const fetchMock = stubFetch(() => Promise.resolve({}))
    const { wrapper } = await abrir(1)

    await wrapper.find('button[data-accion="cancelar"]').trigger('click')

    expect(wrapper.emitted('cancelar')).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('HistorialEtapa', () => {
  const CAMBIOS = [
    { id: 'h2', etapa_tramite_id: etapa(1).id, estatus_anterior_id: 2, estatus_nuevo_id: 4, motivo_rechazo: null, cambiado_por: SESION_API.usuario.id, fecha_cambio: '2026-10-21T21:45:00.000Z' },
    { id: 'h1', etapa_tramite_id: etapa(1).id, estatus_anterior_id: null, estatus_nuevo_id: 2, motivo_rechazo: null, cambiado_por: 'otro-usuario-sin-nombre', fecha_cambio: '2026-01-12T10:00:00.000Z' },
    { id: 'h3', etapa_tramite_id: etapa(1).id, estatus_anterior_id: 4, estatus_nuevo_id: 7, motivo_rechazo: 'Falta la constancia', cambiado_por: USUARIOS_SUPERVISOR[1]!.id, fecha_cambio: '2026-11-02T18:00:00.000Z' },
  ]

  beforeEach(async () => {
    sessionStorage.clear()
    await iniciarSesion()
  })

  async function abrir(usuarios = USUARIOS_SUPERVISOR) {
    const wrapper = await mountSuspended(HistorialEtapa, { props: { clienteId: CLIENTE.id, etapa: etapa(1), estatus: ESTATUS, usuarios } })
    await vi.waitFor(() => expect(wrapper.text()).not.toMatch(/cargando/i))
    return wrapper
  }

  it('lista los cambios con estatus anterior, nuevo, usuario y fecha, del más reciente al más antiguo', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(CAMBIOS))
    const wrapper = await abrir()

    expect((fetchMock.mock.calls[0] as Llamada)[0]).toBe(`${rutaEtapa(1)}/historial`)
    const filas = wrapper.findAll('[data-cambio]')
    expect(filas).toHaveLength(3)
    expect(filas[0]!.text()).toContain('Falta la constancia')
    expect(filas[0]!.text()).toContain('En proceso asesor')
    expect(filas[0]!.text()).toContain('Bloqueado')
    expect(filas[0]!.text()).toContain('Carlos Montes')
    expect(filas[0]!.text()).toContain(formatearFechaHora('2026-11-02T18:00:00.000Z'))
    expect(filas[1]!.text()).toContain('Por iniciar')
    expect(filas[1]!.text()).toContain('En proceso asesor')
    expect(filas[1]!.text()).toContain('Ana Pérez')
    expect(filas[2]!.text()).toContain('Sin estatus previo')
    expect(filas[2]!.text()).toContain('Otro usuario')
  })

  it('sin cambios lo dice, y si la API falla muestra un error con reintentar', async () => {
    stubFetch(() => Promise.resolve([]))
    expect((await abrir()).text()).toMatch(/sin cambios registrados/i)

    stubFetch(() => Promise.reject(errorHttp(500, { message: 'Error interno del servidor' })))
    const wrapper = await abrir()
    expect(wrapper.text()).toMatch(/no se pudo cargar el historial/i)
    expect(wrapper.find('button[data-accion="reintentar"]').exists()).toBe(true)
  })
})

describe('Cambio de estatus en el expediente', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    document.body.innerHTML = ''
  })

  function api(rol: Rol, opciones: { rechazo?: boolean } = {}) {
    let etapas = RESPUESTA_ETAPAS
    return stubFetch((ruta, o) => {
      const r = ruta as string
      const { method, body } = o as Llamada[1]
      if (r === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
      if (r === `/clientes/${CLIENTE.id}`) return Promise.resolve(CLIENTE)
      if (r === `/clientes/${CLIENTE.id}/etapas`) return Promise.resolve(etapas)
      if (r === rutaEtapa(5) && method === 'PATCH') {
        if (opciones.rechazo) return Promise.reject(errorHttp(400, { message: 'Bloqueado requiere motivo_rechazo.' }))
        etapas = { avance_global: 40, etapas: etapas.etapas.map(e => (e.id === etapa(5).id ? { ...e, ...body, estatus_id: body!.estatus_id as number, avance_porcentaje: (body!.avance_porcentaje as number) ?? e.avance_porcentaje } : e)) }
        return Promise.resolve(etapas.etapas[5])
      }
      if (r === `${rutaEtapa(5)}/historial`) return Promise.resolve([{ id: 'h9', etapa_tramite_id: etapa(5).id, estatus_anterior_id: 2, estatus_nuevo_id: 5, motivo_rechazo: null, cambiado_por: SESION_API.usuario.id, fecha_cambio: '2026-11-03T12:00:00.000Z' }])
      if (r === `/clientes/${CLIENTE.id}/documentos`) return Promise.resolve(DOCUMENTOS)
      if (r === '/catalogos/estatus') return Promise.resolve(ESTATUS)
      if (r === '/catalogos/regimenes') return Promise.resolve(REGIMENES)
      if (r === '/catalogos/leyes-probables') return Promise.resolve(LEYES)
      if (r === '/catalogos/afores') return Promise.resolve(AFORES)
      if (r === '/usuarios') return Promise.resolve(USUARIOS_SUPERVISOR)
      if (r === '/agenda' || r === '/avisos') return Promise.resolve([])
      return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))
    })
  }

  async function abrir(rol: Rol = 'asesor', opciones: { rechazo?: boolean } = {}) {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    rutaMock.params.id = CLIENTE.id
    const fetchMock = api(rol, opciones)
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const wrapper = await mountSuspended(ExpedientePage)
    await vi.waitFor(() => expect(wrapper.findAll('[data-etapa-card]').length).toBeGreaterThan(0))
    return { wrapper, fetchMock }
  }
  const tarjetaM10 = (w: Awaited<ReturnType<typeof abrir>>['wrapper']) => w.findAll('[data-etapa-card]').find(t => t.text().includes('Estrategia Modalidad 10'))!
  const enDocumento = (selector: string) => document.body.querySelector<HTMLElement>(selector)
  const cargasDeEtapas = (m: Awaited<ReturnType<typeof abrir>>['fetchMock']) => (m.mock.calls as Llamada[]).filter(([ruta, o]) => ruta === `/clientes/${CLIENTE.id}/etapas` && o.method === 'GET').length

  it('el botón de cambio de estatus solo aparece para el Asesor; el historial lo ven todos', async () => {
    for (const [rol, puede] of [['asesor', true], ['auxiliar', false], ['supervisor', false]] as const) {
      const { wrapper } = await abrir(rol)
      expect(wrapper.findAll('[data-etapa-card] button[data-accion="cambiar-estatus"]'), rol).toHaveLength(puede ? 3 : 0)
      expect(wrapper.findAll('[data-etapa-card] button[data-accion="historial"]'), rol).toHaveLength(3)
      await wrapper.findAll('[data-seguimiento] button[role="tab"]').find(b => b.text().includes('Todas'))!.trigger('click')
      expect(wrapper.findAll('[data-etapa-fila] button[data-accion="cambiar-estatus"]'), rol).toHaveLength(puede ? 16 : 0)
      wrapper.unmount()
    }
  })

  it('cambiar el estatus envía el PATCH, recarga las etapas y el avance global y cierra el modal', async () => {
    const { wrapper, fetchMock } = await abrir()
    const antes = cargasDeEtapas(fetchMock)

    await tarjetaM10(wrapper).find('button[data-accion="cambiar-estatus"]').trigger('click')
    await vi.waitFor(() => expect(enDocumento('[role="dialog"] select[name="estatus_id"]')).not.toBeNull())
    expect(document.body.textContent).toContain('Estrategia Modalidad 10')
    const poner = async (selector: string, valor: string) => {
      const el = enDocumento(selector) as HTMLInputElement | HTMLSelectElement
      el.value = valor
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
      await flushPromises()
    }
    await poner('[role="dialog"] input[name="avance_porcentaje"]', '75')
    enDocumento('[role="dialog"] button[type="submit"]')!.click()
    await flushPromises()

    const patch = (fetchMock.mock.calls as Llamada[]).find(([ruta, o]) => ruta === rutaEtapa(5) && o.method === 'PATCH')!
    expect(patch[1].body).toMatchObject({ estatus_id: 5, avance_porcentaje: 75 })
    await vi.waitFor(() => expect(cargasDeEtapas(fetchMock)).toBe(antes + 1))
    await vi.waitFor(() => expect(wrapper.find('[data-avance-global]').text()).toContain('40%'))
    expect(tarjetaM10(wrapper).text()).toContain('75%')
  })

  it('si el backend rechaza el cambio, muestra el error, recarga las etapas y deja el modal abierto', async () => {
    const { wrapper, fetchMock } = await abrir('asesor', { rechazo: true })
    const antes = cargasDeEtapas(fetchMock)

    await tarjetaM10(wrapper).find('button[data-accion="cambiar-estatus"]').trigger('click')
    await vi.waitFor(() => expect(enDocumento('[role="dialog"] form')).not.toBeNull())
    enDocumento('[role="dialog"] button[type="submit"]')!.click()
    await flushPromises()

    expect(document.body.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('Bloqueado requiere motivo')
    await vi.waitFor(() => expect(cargasDeEtapas(fetchMock)).toBe(antes + 1))
    expect(enDocumento('[role="dialog"] form')).not.toBeNull()
  })

  it('el historial de una etapa se abre desde su tarjeta y muestra los cambios', async () => {
    const { wrapper, fetchMock } = await abrir('supervisor')

    await tarjetaM10(wrapper).find('button[data-accion="historial"]').trigger('click')
    await vi.waitFor(() => expect(document.body.querySelectorAll('[role="dialog"] [data-cambio]').length).toBe(1))

    expect((fetchMock.mock.calls as Llamada[]).some(([ruta]) => ruta === `${rutaEtapa(5)}/historial`)).toBe(true)
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Estrategia Modalidad 10')
    expect(document.body.querySelector('[role="dialog"] [data-cambio]')?.textContent).toContain('Por iniciar')
  })
})
