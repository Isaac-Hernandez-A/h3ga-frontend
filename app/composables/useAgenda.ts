import type { EventoAgenda } from '~/types/expediente'

export type NuevoEvento = Pick<EventoAgenda, 'cliente_id' | 'fecha' | 'hora' | 'motivo' | 'estatus'>

// Agenda de citas. El backend filtra por rol (el Asesor ve las de sus clientes, el Auxiliar las de sus clientes
// autorizados y el Supervisor todas); solo el Asesor agenda, reagenda, cumple o cancela.
export function useAgenda() {
  const api = useApi()

  return {
    listar: () => api.get<EventoAgenda[]>('/agenda'),
    agendar: (datos: NuevoEvento) => api.post<EventoAgenda>('/agenda', datos),
    actualizar: (id: string, datos: Partial<NuevoEvento>) => api.patch<EventoAgenda>(`/agenda/${id}`, datos),
  }
}
