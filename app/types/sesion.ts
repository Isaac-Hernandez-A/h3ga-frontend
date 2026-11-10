// Contrato del login (POST /auth/login). Provisional: reemplazar por los tipos generados
// (`pnpm api:types` -> types/api.d.ts, components['schemas']['SesionRespuesta']) en cuanto el backend esté levantado.
export type Rol = 'asesor' | 'auxiliar' | 'supervisor'

export interface UsuarioSesion {
  id: string
  nombre: string
  rol: Rol
}

export interface SesionRespuesta {
  access_token: string
  expires_in: number
  usuario: UsuarioSesion
}
