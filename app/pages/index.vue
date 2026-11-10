<script setup lang="ts">
// Provisional: la Tarea F3 lo reemplaza por el diseño con menú por rol y la redirección según el rol.
const sesion = useSessionStore()
</script>

<template>
  <main class="mx-auto max-w-xl p-8">
    <h1 class="font-display text-2xl font-semibold">
      Hola, {{ sesion.usuario?.nombre }}
    </h1>
    <p class="mt-2 text-neutral-600">
      Rol: {{ sesion.usuario?.rol }}
    </p>
    <UButton
      class="mt-6"
      color="neutral"
      variant="outline"
      @click="sesion.cerrarSesion()"
    >
      Cerrar sesión
    </UButton>
  </main>
</template>
