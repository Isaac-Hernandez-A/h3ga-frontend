<script setup lang="ts">
// Barras horizontales dibujadas a mano. Con `apiladas` cada fila trae dos tramos: al día y con avance detenido.
const props = defineProps<{ filas: { etiqueta: string, valor: number, extra?: number }[], apiladas?: boolean }>()

const maximo = computed(() => Math.max(1, ...props.filas.map(f => f.valor + (f.extra ?? 0))))
const ancho = (n: number) => `${(n / maximo.value) * 100}%`
</script>

<template>
  <ul class="space-y-1.5">
    <li
      v-for="f in filas"
      :key="f.etiqueta"
      data-barra
      class="grid grid-cols-[minmax(8rem,14rem)_1fr] items-center gap-3 text-sm"
    >
      <span class="text-right text-neutral-600">{{ f.etiqueta }}</span>
      <span class="flex items-center gap-2">
        <span
          class="flex h-4 overflow-hidden rounded-full"
          :style="{ width: ancho(f.valor + (f.extra ?? 0)), minWidth: f.valor + (f.extra ?? 0) ? '0.5rem' : '0' }"
        >
          <span
            class="h-full bg-profundo-500"
            :style="{ width: `${(f.valor / Math.max(f.valor + (f.extra ?? 0), 1)) * 100}%` }"
          />
          <span
            v-if="apiladas && f.extra"
            class="h-full bg-amber-400"
            :style="{ width: `${((f.extra ?? 0) / Math.max(f.valor + (f.extra ?? 0), 1)) * 100}%` }"
          />
        </span>
        <span
          data-valor-barra
          class="font-semibold text-neutral-900"
        >{{ apiladas ? f.valor + (f.extra ?? 0) : f.valor }}</span>
      </span>
    </li>
  </ul>
</template>
