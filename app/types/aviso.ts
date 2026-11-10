// Contrato de GET /avisos (entidad Aviso del backend). Provisional: reemplazar por los tipos generados
// (`pnpm api:types`) cuando se generen.
export interface Aviso {
  id: string
  tipo: 'tramite' | 'cita'
  etapa_tramite_id: string | null
  evento_id: string | null
  fecha_alerta: string
  atendido: boolean
  atendido_por: string | null
  fecha_atencion: string | null
}
