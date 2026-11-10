import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import authGlobal from '~/middleware/auth.global'
import { SESION_API, stubFetch } from './ayudas'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))

type Rol = 'asesor' | 'auxiliar' | 'supervisor'
const ROLES: Rol[] = ['asesor', 'auxiliar', 'supervisor']
const RUTAS = ['/', '/login', '/clientes', '/clientes/123', '/agenda', '/avisos', '/reportes', '/usuarios', '/no-existe']

async function iniciarComo(rol: Rol) {
  stubFetch(() => Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } }))
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
}

// Aplica el middleware a una ruta y devuelve el destino de la redirección (o null si deja pasar).
function destino(ruta: string): string | null {
  navigateToMock.mockClear()
  const resultado = authGlobal({ path: ruta } as never, { path: '/' } as never) as { redirigido?: string } | undefined
  return resultado?.redirigido ?? null
}

describe('Middleware de sesión y rol', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    navigateToMock.mockImplementation((ruta: string) => ({ redirigido: ruta }))
    setActivePinia(createPinia())
  })

  it('CF-06 sin sesión redirige a /login desde cualquier ruta protegida, y deja pasar /login', () => {
    for (const ruta of RUTAS.filter(r => r !== '/login')) {
      expect(destino(ruta), ruta).toBe('/login')
    }
    expect(destino('/login')).toBeNull()
  })

  it('CF-06 con rol no permitido redirige al inicio', async () => {
    await iniciarComo('auxiliar')
    expect(destino('/usuarios')).toBe('/')
    expect(destino('/reportes')).toBe('/')

    await iniciarComo('asesor')
    expect(destino('/usuarios')).toBe('/')

    await iniciarComo('supervisor')
    expect(destino('/usuarios')).toBeNull()
    expect(destino('/reportes')).toBeNull()
  })

  it('con sesión vigente, /login manda al inicio y las rutas de su rol pasan (incluidas las anidadas)', async () => {
    await iniciarComo('asesor')
    expect(destino('/login')).toBe('/')
    expect(destino('/clientes')).toBeNull()
    expect(destino('/clientes/123')).toBeNull()
    expect(destino('/agenda')).toBeNull()
  })

  it('CF-06 sin bucles: seguir las redirecciones termina en una ruta que deja pasar, en a lo sumo 2 saltos', async () => {
    const sesiones: (Rol | null)[] = [null, ...ROLES]
    for (const rol of sesiones) {
      sessionStorage.clear()
      setActivePinia(createPinia())
      if (rol) await iniciarComo(rol)

      for (const inicial of RUTAS) {
        let actual = inicial
        let saltos = 0
        for (let siguiente = destino(actual); siguiente !== null; siguiente = destino(actual)) {
          actual = siguiente
          saltos++
          expect(saltos, `bucle: ${rol ?? 'sin sesión'} desde ${inicial}`).toBeLessThanOrEqual(2)
        }
      }
    }
  })

  it('con la sesión vencida trata al usuario como sin sesión', async () => {
    await iniciarComo('asesor')
    useSessionStore().expiraEn = Date.now() - 1

    expect(destino('/clientes')).toBe('/login')
    expect(useSessionStore().token).toBeNull()
  })
})
