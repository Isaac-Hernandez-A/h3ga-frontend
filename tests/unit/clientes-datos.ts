import type { Cliente } from '~/types/cliente'
import type { Usuario } from '~/types/usuario'
import { SESION_API } from './ayudas'

export const ASESOR_A = SESION_API.usuario.id
export const ASESOR_B = '66666666-6666-4666-8666-666666666666'

const base: Omit<Cliente, 'id' | 'nombre' | 'apellido_paterno' | 'apellido_materno' | 'curp' | 'asesor_id' | 'fecha_ingreso'> = {
  referido_por: '',
  telefono: '9981234567',
  correo_electronico: 'cliente@ejemplo.com',
  rfc: null,
  fecha_nacimiento: '1965-02-21',
  estado_civil: 'casado',
  dependientes_economicos: 0,
  regimen_id: 1,
  nss: null,
  ley_probable_id: 1,
  semanas_imss_reconocidas: 500,
  semanas_a_recuperar: null,
  tiene_issste: 'no',
  afore_id: 1,
  observaciones_generales: '',
  requiere_contadora: 'no',
  sexo: 'mujer',
  ocupacion: null,
  domicilio: 'Calle Sur 12',
  estado: 'Quintana Roo',
  subdelegacion_imss_probable: '',
  cambio_afore: 'no',
  ine: null,
  objetivo_cliente: 'pensionarse_asap',
}

// Datos ficticios. Las CURP tienen el formato oficial pero no corresponden a nadie.
export const CLIENTES: Cliente[] = [
  { ...base, id: 'c1111111-1111-4111-8111-111111111111', nombre: 'María Elena', apellido_paterno: 'Rodríguez', apellido_materno: 'Salas', curp: 'ROSM800315MDFDLR09', asesor_id: ASESOR_A, fecha_ingreso: '2026-01-12' },
  { ...base, id: 'c2222222-2222-4222-8222-222222222222', nombre: 'Iván', apellido_paterno: 'Barrera', apellido_materno: 'Lozano', curp: 'BALI750101HDFRZV05', asesor_id: ASESOR_B, fecha_ingreso: '2026-02-03', sexo: 'hombre' },
  { ...base, id: 'c3333333-3333-4333-8333-333333333333', nombre: 'José Ángel', apellido_paterno: 'Núñez', apellido_materno: 'Pérez', curp: 'NUPJ900822HQRXRZ08', asesor_id: ASESOR_A, fecha_ingreso: '2026-03-20', sexo: 'hombre' },
  { ...base, id: 'c4444444-4444-4444-8444-444444444444', nombre: 'Daniela', apellido_paterno: 'Cruz', apellido_materno: 'Palacios', curp: null, asesor_id: ASESOR_B, fecha_ingreso: '2025-12-01' },
]

const usuario = { tipo_asesor_id: null, apellido_materno: '', fecha_creacion: '2026-01-01T00:00:00.000Z' }

// Lo que responde GET /usuarios al Supervisor: de aquí salen los nombres de los asesores.
export const USUARIOS_SUPERVISOR: Usuario[] = [
  { ...usuario, id: ASESOR_A, rol_id: 1, nombre: 'Ana', apellido_paterno: 'Pérez', correo_electronico: 'ana@h3ga.mx', activo: true },
  { ...usuario, id: ASESOR_B, rol_id: 1, nombre: 'Carlos', apellido_paterno: 'Montes', correo_electronico: 'carlos@h3ga.mx', activo: true },
  { ...usuario, id: '77777777-7777-4777-8777-777777777777', rol_id: 1, nombre: 'Rosa', apellido_paterno: 'Vega', correo_electronico: 'rosa@h3ga.mx', activo: true },
  { ...usuario, id: '88888888-8888-4888-8888-888888888888', rol_id: 1, nombre: 'Baja', apellido_paterno: 'Revocado', correo_electronico: 'baja@h3ga.mx', activo: false },
  { ...usuario, id: '99999999-9999-4999-8999-999999999999', rol_id: 2, nombre: 'Aux', apellido_paterno: 'Iliar', correo_electronico: 'aux@h3ga.mx', activo: true },
  { ...usuario, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', rol_id: 3, nombre: 'Sara', apellido_paterno: 'Supervisor', correo_electronico: 'sara@h3ga.mx', activo: true },
]

export const REGIMENES = [{ id: 1, nombre: 'IMSS' }, { id: 2, nombre: 'ISSSTE' }, { id: 5, nombre: 'No determinado' }]
export const LEYES = [{ id: 1, nombre: 'Ley 73' }, { id: 2, nombre: 'Ley 97' }]
export const AFORES = [{ id: 1, nombre: 'Azteca' }, { id: 2, nombre: 'Profuturo' }]
