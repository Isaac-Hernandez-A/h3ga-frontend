<script setup lang="ts">
import { rutaInicio } from '~/utils/menu'

definePageMeta({ titulo: 'Inicio' })

const sesion = useSessionStore()
const router = useRouter()

// Cada rol entra a su primera pantalla de trabajo. Mientras esa pantalla no exista (se construyen en las
// tareas F5 a F9), se queda en este saludo en lugar de caer en una página 404.
const destino = sesion.usuario ? rutaInicio(sesion.usuario.rol) : null
if (destino && destino !== '/' && router.resolve(destino).matched.length > 0) {
  await navigateTo(destino, { replace: true })
}
</script>

<template>
  <section class="max-w-xl">
    <h2 class="font-display text-2xl font-semibold text-profundo-900">
      Hola, {{ sesion.usuario?.nombre }}
    </h2>
    <p class="mt-2 text-neutral-600">
      Elige una opción del menú para empezar.
    </p>
  </section>
</template>
