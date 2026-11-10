import { vi } from 'vitest'

export const SESION_API = {
  access_token: 'token.de.prueba',
  expires_in: 28800,
  usuario: { id: '11111111-1111-4111-8111-111111111111', nombre: 'Ana Pérez', rol: 'asesor' as const },
}

// Imita el error que lanza ofetch cuando el servidor responde con un estado de error.
export function errorHttp(status: number, cuerpo: unknown = {}) {
  return Object.assign(new Error(`HTTP ${status}`), {
    response: { status, _data: cuerpo },
    data: cuerpo,
    statusCode: status,
  })
}

// Imita el error de red: no hay respuesta del servidor.
export function errorRed() {
  return Object.assign(new TypeError('Failed to fetch'), { response: undefined })
}

export function stubFetch(impl: (...args: unknown[]) => unknown) {
  const mock = vi.fn(impl)
  vi.stubGlobal('$fetch', mock)
  return mock
}
