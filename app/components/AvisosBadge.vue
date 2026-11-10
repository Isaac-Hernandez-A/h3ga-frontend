<script setup lang="ts">
import type { Aviso } from '~/types/aviso'
import { ApiError } from '~/utils/api-error'

const api = useApi()
const route = useRoute()
const pendientes = ref(0)

// Los pide al cargar y cada vez que cambia de pantalla.
async function cargar() {
  try {
    const avisos = await api.get<Aviso[]>('/avisos', { query: { atendido: false } })
    pendientes.value = avisos.length
  }
  catch (error) {
    // Un fallo de avisos no debe romper el menú; useApi ya avisó si fue un problema de red o de permiso.
    if (!(error instanceof ApiError)) throw error
    pendientes.value = 0
  }
}

onMounted(cargar)
watch(() => route.path, cargar)

// El resto de pantallas (F8) pueden pedir que se refresque, por ejemplo al atender un aviso.
defineExpose({ recargar: cargar })
</script>

<template>
  <span
    v-if="pendientes > 0"
    class="inline-flex min-w-6 items-center justify-center rounded-full bg-marca-50 px-1.5 text-sm font-semibold text-profundo-500"
    :aria-label="`${pendientes} ${pendientes === 1 ? 'aviso pendiente' : 'avisos pendientes'}`"
  >{{ pendientes }}</span>
</template>
