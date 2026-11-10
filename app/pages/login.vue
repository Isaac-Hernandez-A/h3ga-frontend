<script setup lang="ts">
// Esqueleto de la Tarea F1. La lógica de sesión llega en la Tarea F2.
const correo = ref('')
const contrasena = ref('')
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-lg font-semibold">
          Iniciar sesión
        </h1>
      </template>

      <form
        class="space-y-4"
        @submit.prevent
      >
        <UFormField
          label="Correo electrónico"
          name="correo_electronico"
        >
          <UInput
            v-model="correo"
            type="email"
            autocomplete="username"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Contraseña"
          name="contrasena"
        >
          <UInput
            v-model="contrasena"
            type="password"
            autocomplete="current-password"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          block
        >
          Entrar
        </UButton>
      </form>
    </UCard>
  </main>
</template>
