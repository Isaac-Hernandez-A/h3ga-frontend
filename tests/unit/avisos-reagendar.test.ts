import { beforeEach, describe, expect, it } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useAgenda } from '~/composables/useAgenda'
import { useEtapas } from '~/composables/useEtapas'
import { SESION_API, errorHttp, stubFetch } from './ayudas'

mockNuxtImport('navigateTo', () => () => undefined)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: () => undefined }))

type Llamada = [string, { method: string, query?: Record<string, unknown> }]
const CLIENTE_ID = 'c1111111-1111-4111-8111-111111111111'
const aviso = { id: 'a1', tipo: 'cita', atendido: false, titulo: 'Cita programada', cliente_nombre: 'Cliente', fecha_compromiso: '2026-11-20', hora: null }

// Agenda y trámites están conectados con los avisos: al reagendar o mover un compromiso, la campana y el Centro de avisos
// vuelven a leer la bandeja (el backend genera ahí el aviso del nuevo día).
function api(falla = false) {
  return stubFetch((ruta, o) => {
    const r = ruta as string
    const { method } = (o ?? {}) as Llamada[1]
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API })
    if (r === '/avisos' && method === 'GET') return Promise.resolve([aviso])
    if (falla) return Promise.reject(errorHttp(400, { message: 'Dato inválido' }))
    if (r === '/agenda' && method === 'POST') return Promise.resolve({ id: 'ev1' })
    if (r === '/agenda/ev1' && method === 'PATCH') return Promise.resolve({ id: 'ev1', estatus: 'reagendado' })
    if (r === `/clientes/${CLIENTE_ID}/etapas/e1` && method === 'PATCH') return Promise.resolve({ id: 'e1' })
    return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))
  })
}

async function preparar(falla = false) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  const mock = api(falla)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  const avisos = useAvisosStore()
  avisos.pendientes = 0
  avisos.lista = []
  return { mock, avisos }
}
const pidioAvisos = (m: ReturnType<typeof api>) => (m.mock.calls as Llamada[]).some(([r, o]) => r === '/avisos' && o.method === 'GET' && o.query?.atendido === false)

describe('Agenda y trámites conectados con los avisos', () => {
  beforeEach(() => sessionStorage.clear())

  it('al reagendar una cita vuelve a leer los avisos y la campana se actualiza', async () => {
    const { mock, avisos } = await preparar()
    await useAgenda().actualizar('ev1', { fecha: '2026-11-25', estatus: 'reagendado' })
    await flushPromises()
    expect(pidioAvisos(mock)).toBe(true)
    expect(avisos.pendientes).toBe(1)
    expect(avisos.lista[0]!.id).toBe('a1')
  })

  it('al agendar una cita nueva también', async () => {
    const { mock } = await preparar()
    await useAgenda().agendar({ cliente_id: CLIENTE_ID, fecha: '2026-11-14', hora: '10:00:00', motivo: 'Revisión', estatus: 'pendiente' })
    await flushPromises()
    expect(pidioAvisos(mock)).toBe(true)
  })

  it('al cambiar el estatus, la fecha o el compromiso de un trámite vuelve a leer los avisos', async () => {
    const { mock, avisos } = await preparar()
    await useEtapas(CLIENTE_ID).cambiarEstatus('e1', { estatus_id: 4, fecha_compromiso: '2026-11-25' })
    await flushPromises()
    expect(pidioAvisos(mock)).toBe(true)
    expect(avisos.pendientes).toBe(1)
  })

  it('si el backend rechaza el cambio no toca los avisos', async () => {
    const { mock } = await preparar(true)
    await expect(useAgenda().actualizar('ev1', { fecha: '2026-11-25' })).rejects.toBeTruthy()
    await expect(useEtapas(CLIENTE_ID).cambiarEstatus('e1', { estatus_id: 4 })).rejects.toBeTruthy()
    await flushPromises()
    expect(pidioAvisos(mock)).toBe(false)
  })
})
