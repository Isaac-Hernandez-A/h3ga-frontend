import type { Aviso } from '~/types/aviso'
import { CLIENTES } from './clientes-datos'

export const CLIENTE = CLIENTES[0]!

const estatus = (id: number, nombre: string, categoria: string, fijo: number | null, editable: boolean) => ({
  id, nombre, descripcion: '', categoria, avance_porcentaje_fijo: fijo, avance_editable: editable, avance_min: editable ? 20 : null, avance_max: editable ? 90 : null,
})

// Igual que el catálogo real del backend: el avance es editable (20 a 90) solo en los "En proceso".
export const ESTATUS = [
  estatus(1, 'No aplica', 'no_aplica', null, false),
  estatus(2, 'Por iniciar', 'pendiente', 10, false),
  estatus(3, 'En proceso cliente', 'en_proceso', null, true),
  estatus(4, 'En proceso asesor', 'en_proceso', null, true),
  estatus(5, 'En proceso Instituto', 'en_proceso', null, true),
  estatus(6, 'Finalizado', 'completado', 100, false),
  estatus(7, 'Bloqueado', 'excepcion', null, false),
  estatus(8, 'Cancelado', 'excepcion', null, false),
  estatus(9, 'Detenido', 'excepcion', null, false),
]

const NOMBRES_ETAPAS = [
  'Diagnóstico inicial', 'Diagnóstico especializado', 'Corrección de datos personales', 'Unificación de NSS',
  'Aclaración/recuperación de semanas', 'Estrategia Modalidad 10', 'Estrategia Modalidad 40', 'Modalidad 40 retroactiva',
  'IMSS-ISSSTE/doble pensión', 'Unificación AFORE/cuentas', 'SAR 92', 'Solicitud de pensión',
  'Negativa de pensión/recuperación de recursos', 'Juicio/Jurisdicción', 'Cobranza Final', 'Finalización',
]

// Estatus y avance de las etapas que no son "Por iniciar".
const AVANCES: Record<number, { estatus_id: number, avance_porcentaje: number, motivo_rechazo?: string, fecha_compromiso?: string }> = {
  0: { estatus_id: 6, avance_porcentaje: 100 },
  1: { estatus_id: 4, avance_porcentaje: 60 },
  5: { estatus_id: 5, avance_porcentaje: 40 },
  6: { estatus_id: 7, avance_porcentaje: 30, motivo_rechazo: 'Falta la constancia de semanas' },
}

export const ETAPAS = NOMBRES_ETAPAS.map((nombre, paso) => ({
  numero_paso: paso,
  nombre,
  id: `e${String(paso).padStart(7, '0')}-0000-4000-8000-000000000000`,
  cliente_id: CLIENTE.id,
  etapa_id: paso + 1,
  estatus_id: AVANCES[paso]?.estatus_id ?? 2,
  avance_porcentaje: AVANCES[paso]?.avance_porcentaje ?? 10,
  accion_a_realizar: null,
  fecha_compromiso: null,
  fecha_completada: null,
  reactivado_en: null,
  creado_el: '2026-01-12T10:00:00.000Z',
  actualizado_el: paso === 5 ? '2026-10-21T21:45:00.000Z' : '2026-01-12T10:00:00.000Z',
  motivo_rechazo: AVANCES[paso]?.motivo_rechazo ?? null,
}))

export const RESPUESTA_ETAPAS = { avance_global: 31, etapas: ETAPAS }

export const TIPOS_DOCUMENTO = [
  { id: 1, nombre: 'Acta de Nacimiento' },
  { id: 2, nombre: 'CURP' },
  { id: 3, nombre: 'INE' },
]

export const DOCUMENTOS = [
  { id: 'd1111111-0000-4000-8000-000000000001', cliente_id: CLIENTE.id, tipo_documento_id: 1, archivo_path: 'x/1', nombre_archivo_original: 'Constancia de semanas cotizadas.pdf', mime_type: 'application/pdf', estatus: 'por_confirmar', numero_referencia: null, fecha_carga: '2026-10-01T15:00:00.000Z', subido_por: 'u1', observaciones: null },
  { id: 'd2222222-0000-4000-8000-000000000002', cliente_id: CLIENTE.id, tipo_documento_id: 2, archivo_path: 'x/2', nombre_archivo_original: 'Baja del régimen obligatorio.pdf', mime_type: 'application/pdf', estatus: 'si', numero_referencia: null, fecha_carga: '2026-10-05T15:00:00.000Z', subido_por: 'u1', observaciones: null },
  { id: 'd3333333-0000-4000-8000-000000000003', cliente_id: CLIENTE.id, tipo_documento_id: 3, archivo_path: 'x/3', nombre_archivo_original: 'Identificación oficial.png', mime_type: 'image/png', estatus: 'no', numero_referencia: null, fecha_carga: '2026-10-20T15:00:00.000Z', subido_por: 'u1', observaciones: 'Ilegible' },
]

// "AAAA-MM-DD" a N días de hoy (hora local).
export function enDiasISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const eventoProximo = (dias = 2) => ({
  id: 'ev111111-0000-4000-8000-000000000001',
  asesor_id: CLIENTE.asesor_id,
  cliente_id: CLIENTE.id,
  fecha: enDiasISO(dias),
  hora: '10:30:00',
  motivo: 'Cita IMSS',
  estatus: 'pendiente',
})

export const eventoDeOtroCliente = () => ({ ...eventoProximo(1), id: 'ev222222-0000-4000-8000-000000000002', cliente_id: CLIENTES[1]!.id, motivo: 'Cita de otro cliente' })

export const AVISOS: Aviso[] = [
  { id: 'av000001-0000-4000-8000-000000000001', tipo: 'tramite', etapa_tramite_id: ETAPAS[5]!.id, evento_id: null, fecha_alerta: '2026-11-10T00:00:00.000Z', atendido: false, atendido_por: null, fecha_atencion: null },
  { id: 'av000002-0000-4000-8000-000000000002', tipo: 'tramite', etapa_tramite_id: 'otra-etapa-de-otro-cliente', evento_id: null, fecha_alerta: '2026-11-10T00:00:00.000Z', atendido: false, atendido_por: null, fecha_atencion: null },
]
