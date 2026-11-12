import { defineStore } from 'pinia'
import type { Aviso } from '~/types/aviso'
import { ApiError } from '~/utils/api-error'

// Cuántos avisos tiene pendientes el usuario: lo comparten el contador del menú y el Centro de avisos, para que baje al
// atender uno sin pedir la lista dos veces a la vez.
export const useAvisosStore = defineStore('avisos', () => {
  const api = useApi()
  const pendientes = ref(0)
  let enCurso: Promise<void> | null = null

  function cargar(): Promise<void> {
    enCurso ??= (async () => {
      try {
        pendientes.value = (await api.get<Aviso[]>('/avisos', { query: { atendido: false } })).length
      }
      catch (error) {
        // Un fallo de avisos no debe romper el menú; useApi ya avisó si fue un problema de red o de permiso.
        if (!(error instanceof ApiError)) throw error
        pendientes.value = 0
      }
      finally {
        enCurso = null
      }
    })()
    return enCurso
  }

  return { pendientes, cargar }
})
