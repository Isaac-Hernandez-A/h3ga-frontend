import { ApiError } from '~/utils/api-error'

type Consulta = Record<string, string | number | boolean | undefined>
interface OpcionesGet { query?: Consulta }
interface RespuestaError {
  response?: { status?: number, _data?: unknown }
  data?: unknown
  statusCode?: number
}

const MENSAJE_RED = 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
const MENSAJE_SESION_INVALIDA = 'Tu sesión ya no es válida. Inicia sesión de nuevo.'
const MENSAJE_SIN_PERMISO = 'No tienes permiso para realizar esta acción.'

// Nest devuelve los errores de validación como ["campo debe ser ...", ...]: el primer término es el campo.
function camposDe(mensajes: string[]): Record<string, string> | undefined {
  const campos: Record<string, string> = {}
  for (const texto of mensajes) {
    const coincidencia = /^([a-z_][a-z0-9_.]*)\s+(.+)$/i.exec(texto)
    if (coincidencia) campos[coincidencia[1]!] = coincidencia[2]!
  }
  return Object.keys(campos).length > 0 ? campos : undefined
}

function nombreDeArchivo(cabecera: string | null): string | null {
  if (!cabecera) return null
  const codificado = /filename\*=UTF-8''([^;]+)/i.exec(cabecera)
  if (codificado) {
    try {
      return decodeURIComponent(codificado[1]!)
    }
    catch {
      return codificado[1]!
    }
  }
  return /filename="?([^";]+)"?/i.exec(cabecera)?.[1] ?? null
}

// Único punto de acceso a la API: agrega Authorization y centraliza los errores.
export function useApi() {
  const config = useRuntimeConfig()
  const sesion = useSessionStore()
  const toast = useToast()

  function aApiError(error: unknown): ApiError {
    const { response, data, statusCode } = (error ?? {}) as RespuestaError
    const status = response?.status ?? statusCode ?? 0

    if (status === 0) {
      toast.add({ title: 'Sin conexión', description: MENSAJE_RED, color: 'error' })
      return new ApiError(0, MENSAJE_RED)
    }

    const cuerpo = (data ?? response?._data ?? {}) as { message?: string | string[] }
    const mensajes = Array.isArray(cuerpo.message) ? cuerpo.message : undefined
    const mensaje = mensajes ? mensajes.join('; ') : (cuerpo.message ?? `Error ${status}`)

    if (status === 401 && sesion.token) {
      void sesion.cerrarSesion(MENSAJE_SESION_INVALIDA)
    }
    else if (status === 403) {
      toast.add({ title: 'Sin permiso', description: MENSAJE_SIN_PERMISO, color: 'warning' })
    }

    return new ApiError(status, mensaje, status === 400 && mensajes ? camposDe(mensajes) : undefined)
  }

  function exigirSesionVigente() {
    if (sesion.token && !sesion.verificarVigencia()) {
      void navigateTo('/login')
      throw new ApiError(401, MENSAJE_SESION_INVALIDA)
    }
  }

  function cabeceras(): Record<string, string> {
    return sesion.token ? { Authorization: `Bearer ${sesion.token}` } : {}
  }

  async function pedir<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', ruta: string, extra: { body?: unknown, query?: Consulta } = {}): Promise<T> {
    exigirSesionVigente()
    try {
      return await $fetch<T>(ruta, {
        baseURL: config.public.apiBase,
        method,
        headers: cabeceras(),
        ...extra,
      } as Parameters<typeof $fetch>[1]) as T
    }
    catch (error) {
      throw aApiError(error)
    }
  }

  // Pide un archivo con el token y lo guarda con el nombre de Content-Disposition.
  async function descargar(ruta: string, nombreSugerido = 'descarga') {
    exigirSesionVigente()
    let respuesta
    try {
      respuesta = await $fetch.raw(ruta, {
        baseURL: config.public.apiBase,
        headers: cabeceras(),
        responseType: 'blob',
      })
    }
    catch (error) {
      throw aApiError(error)
    }
    const nombre = nombreDeArchivo(respuesta.headers.get('content-disposition')) ?? nombreSugerido
    const url = URL.createObjectURL(respuesta._data as Blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = nombre
    document.body.appendChild(enlace)
    enlace.click()
    enlace.remove()
    URL.revokeObjectURL(url)
    return nombre
  }

  return {
    get: <T>(ruta: string, opciones: OpcionesGet = {}) => pedir<T>('GET', ruta, { query: opciones.query }),
    post: <T>(ruta: string, cuerpo?: unknown) => pedir<T>('POST', ruta, { body: cuerpo }),
    put: <T>(ruta: string, cuerpo?: unknown) => pedir<T>('PUT', ruta, { body: cuerpo }),
    patch: <T>(ruta: string, cuerpo?: unknown) => pedir<T>('PATCH', ruta, { body: cuerpo }),
    descargar,
  }
}
