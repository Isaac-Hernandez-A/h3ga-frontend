import type { RolCatalogo, TipoAsesor, Usuario } from '~/types/usuario'
import { SESION_API } from './ayudas'

export const ROLES: RolCatalogo[] = [
  { id: 1, nombre: 'Asesor', descripcion: null },
  { id: 2, nombre: 'Auxiliar Administrativo', descripcion: null },
  { id: 3, nombre: 'Supervisor Operativo (Admin)', descripcion: null },
]

export const TIPOS_ASESOR: TipoAsesor[] = [{ id: 1, nombre: 'Interno', descripcion: null, activo: true }]

const base = { tipo_asesor_id: null, apellido_materno: '', fecha_creacion: '2026-01-12T10:00:00.000Z' }

// El primero es el usuario con sesión iniciada en las pruebas (SESION_API.usuario.id): debe salir como "Tú".
export const USUARIOS: Usuario[] = [
  { ...base, id: SESION_API.usuario.id, rol_id: 3, nombre: 'Laura', apellido_paterno: 'Hernández', apellido_materno: 'Ibarra', correo_electronico: 'laura.hernandez@h3ga.mx', activo: true },
  { ...base, id: '22222222-2222-4222-8222-222222222222', rol_id: 1, nombre: 'Carlos', apellido_paterno: 'Montes', apellido_materno: 'Quiroz', correo_electronico: 'carlos.montes@h3ga.mx', activo: true },
  { ...base, id: '33333333-3333-4333-8333-333333333333', rol_id: 1, nombre: 'Daniela', apellido_paterno: 'Cruz', apellido_materno: 'Palacios', correo_electronico: 'daniela.cruz@h3ga.mx', activo: true },
  { ...base, id: '44444444-4444-4444-8444-444444444444', rol_id: 2, nombre: 'Iván', apellido_paterno: 'Barrera', apellido_materno: 'Lozano', correo_electronico: 'ivan.barrera@h3ga.mx', activo: true },
  { ...base, id: '55555555-5555-4555-8555-555555555555', rol_id: 2, nombre: 'Fernanda', apellido_paterno: 'Olvera', apellido_materno: 'Núñez', correo_electronico: 'fernanda.olvera@h3ga.mx', activo: false },
]
