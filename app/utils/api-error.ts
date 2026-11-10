// Error que lanza useApi() en cualquier respuesta de error. status 0 = sin respuesta (error de red).
export class ApiError extends Error {
  readonly status: number
  readonly mensaje: string
  readonly campos?: Record<string, string>

  constructor(status: number, mensaje: string, campos?: Record<string, string>) {
    super(mensaje)
    this.name = 'ApiError'
    this.status = status
    this.mensaje = mensaje
    this.campos = campos
  }
}
