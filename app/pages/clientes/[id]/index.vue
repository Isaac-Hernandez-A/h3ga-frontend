<script setup lang="ts">
definePageMeta({ titulo: 'Expediente del cliente' })

const id = String(useRoute().params.id)
const expediente = useExpediente(id)
const { cliente, etapas, estatus, catalogos, usuarios, eventos, avisos, documentos, cargando, estado, asesorNombre, cargar, recargarEtapas } = expediente
</script>

<template>
  <section class="space-y-5">
    <div class="flex items-center justify-between gap-4">
      <NuxtLink
        to="/clientes"
        data-accion="regresar"
        class="inline-flex items-center gap-2 font-medium text-profundo-700 hover:underline"
      >
        <UIcon
          name="i-lucide-undo-2"
          class="size-5"
        />
        Regresar
      </NuxtLink>
      <UButton
        v-if="cliente"
        :to="`/clientes/${id}/archivos`"
        data-accion="ver-archivos"
        color="neutral"
        variant="outline"
        icon="i-lucide-folder"
        size="lg"
        class="bg-white font-medium shadow-md"
      >
        Ver archivos
      </UButton>
    </div>

    <p
      v-if="cargando"
      class="py-16 text-center text-neutral-500"
      role="status"
    >
      Cargando el expediente…
    </p>

    <div
      v-else-if="estado === 'no-encontrado'"
      class="rounded-2xl bg-white p-10 text-center shadow-sm"
    >
      <h2 class="font-display text-2xl font-semibold text-profundo-900">
        Cliente no encontrado
      </h2>
      <p class="mt-2 text-neutral-600">
        El cliente no existe o no tienes acceso a su expediente.
      </p>
    </div>

    <div
      v-else-if="estado === 'fallo'"
      class="rounded-2xl bg-white p-10 text-center shadow-sm"
      role="alert"
    >
      <p class="text-red-700">
        No se pudo cargar el expediente.
      </p>
      <UButton
        class="mt-3"
        color="neutral"
        variant="outline"
        data-accion="reintentar"
        @click="cargar"
      >
        Reintentar
      </UButton>
    </div>

    <div
      v-else-if="cliente"
      class="grid items-start gap-5 xl:grid-cols-[minmax(360px,440px)_1fr]"
    >
      <ClientePerfil
        :cliente="cliente"
        :etapas="etapas?.etapas ?? []"
        :estatus="estatus"
        :catalogos="catalogos"
        :asesor-nombre="asesorNombre"
        :eventos="eventos"
      />
      <SeguimientoTramite
        :cliente-id="id"
        :etapas="etapas"
        :estatus="estatus"
        :eventos="eventos"
        :avisos="avisos"
        :documentos="documentos"
        :usuarios="usuarios"
        @actualizar="recargarEtapas"
      />
    </div>
  </section>
</template>
