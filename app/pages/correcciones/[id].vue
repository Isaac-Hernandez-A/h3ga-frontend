<script setup lang="ts">
import type { TipoDocumento } from '~/types/expediente'
import type { Correccion, TipoCorreccion } from '~/types/f0'
import { DOCUMENTOS_FASE, FASES, TIPO_CORRECCION_NSS, tipoPorFragmento } from '~/utils/correcciones'

definePageMeta({ titulo: 'Correcciones' })

const id = String(useRoute().params.id)
const expediente = useExpediente(id)
const { cliente, etapas, estatus, catalogos, eventos, documentos, cargando, estado, asesorNombre, cargar, cargarDocumentos } = expediente

// Lo que se necesita para saber qué correcciones requiere el cliente y mostrarlas: sus correcciones, el análisis de
// recuperación de semanas del F1 y el catálogo de tipos de documento.
const tiposDocumento = ref<TipoDocumento[]>([])
const tiposCorreccion = ref<TipoCorreccion[]>([])
const correcciones = ref<Correccion[]>([])
const correccionesDisponibles = ref(true)
const aplicaRecuperacion = ref<string | null>(null)
const cargandoCorrecciones = ref(true)

onMounted(async () => {
  const correccionesApi = useCorrecciones(id)
  const resultados = await Promise.allSettled([
    useDocumentos().tipos().then((v) => { tiposDocumento.value = v }),
    correccionesApi.tipos().then((v) => { tiposCorreccion.value = v }),
    correccionesApi.listar().then((v) => { correcciones.value = v }),
    useDiagnostico(id).obtenerRecuperacion().then((v) => { aplicaRecuperacion.value = v ? String(v.aplica ?? '') : null }),
  ])
  // useApi ya avisó los 403 y los errores de red. Sin las correcciones no se puede armar F2 ni F3.
  correccionesDisponibles.value = resultados[1].status === 'fulfilled' && resultados[2].status === 'fulfilled'
  cargandoCorrecciones.value = false
})

const etapaDe = (paso: number) => etapas.value?.etapas.find(e => e.numero_paso === paso) ?? null
const correccionNss = computed(() => correcciones.value.find(c => c.tipo_correccion_id === TIPO_CORRECCION_NSS) ?? null)

// Documentos del cliente de cada tipo requerido (F3 y F4).
const documentosDe = (fragmento: string) => {
  const tipo = tipoPorFragmento(tiposDocumento.value, fragmento)
  return { tipo, lista: tipo ? documentos.value.filter(d => d.tipo_documento_id === tipo.id) : [] }
}
const hayDocumentos = (fase: 'f3' | 'f4') => DOCUMENTOS_FASE[fase].some(d => documentosDe(d.fragmento).lista.length > 0)

// Qué requiere el cliente se deduce de lo ya capturado: correcciones de datos (F2), unificación de NSS (F3) y el análisis
// de recuperación del F1 (F4). Un documento ya subido también cuenta.
const requiere = computed(() => ({
  f2: correcciones.value.some(c => c.tipo_correccion_id !== TIPO_CORRECCION_NSS),
  f3: correccionNss.value !== null || hayDocumentos('f3'),
  f4: ['si', 'requiere_mas_evidencia'].includes(aplicaRecuperacion.value ?? '') || hayDocumentos('f4'),
}))

const SIN_REQUERIR = {
  f2: 'Este cliente no tiene correcciones de datos registradas.',
  f3: 'Este cliente no tiene unificación de NSS: solo se requiere si tiene más de un NSS.',
  f4: 'El diagnóstico (F1) no indica recuperación de semanas para este cliente.',
}
</script>

<template>
  <section class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <NuxtLink
        to="/correcciones"
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

    <div>
      <h2 class="font-display text-2xl font-semibold text-profundo-900">
        Correcciones del cliente
      </h2>
      <p class="text-neutral-700">
        Corrige los datos a mano (F2) y sube los documentos que respaldan la unificación de NSS (F3) y la recuperación de semanas (F4). Si el cliente no requiere una fase, se salta.
      </p>
    </div>

    <p
      v-if="cargando || (cliente && cargandoCorrecciones)"
      class="py-16 text-center text-neutral-500"
      role="status"
    >
      Cargando las correcciones del cliente…
    </p>

    <div
      v-else-if="estado === 'no-encontrado'"
      class="rounded-2xl bg-white p-10 text-center shadow-sm"
    >
      <h3 class="font-display text-2xl font-semibold text-profundo-900">
        Cliente no encontrado
      </h3>
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
        No se pudo cargar el cliente.
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

      <div class="space-y-5">
        <p
          v-if="!correccionesDisponibles"
          class="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center text-neutral-600"
          role="alert"
        >
          No se pudieron cargar las correcciones del cliente. Recarga la página para intentarlo de nuevo.
        </p>

        <template v-else>
          <FaseCorreccion
            v-for="f in FASES"
            :key="f.clave"
            :clave="f.clave"
            :titulo="f.titulo"
            :cliente-id="id"
            :requiere="requiere[f.clave]"
            :etapa="etapaDe(f.paso)"
            :estatus="estatus"
            :sin-requerir="SIN_REQUERIR[f.clave]"
          >
            <CorreccionesDatos
              v-if="f.clave === 'f2'"
              :cliente-id="id"
              :tipos="tiposCorreccion"
              :correcciones="correcciones"
              @correcciones="correcciones = $event"
            />

            <template v-else>
              <DocumentoRequerido
                v-for="d in DOCUMENTOS_FASE[f.clave]"
                :key="d.clave"
                :cliente-id="id"
                :clave="d.clave"
                :titulo="d.titulo"
                :origen="d.origen"
                :ayuda="d.ayuda"
                :tipo="documentosDe(d.fragmento).tipo"
                :documentos="documentosDe(d.fragmento).lista"
                @subido="cargarDocumentos"
              />

              <details
                v-if="f.clave === 'f3'"
                data-seccion="detalle-nss"
                :open="!correccionNss"
                class="rounded-xl border border-neutral-200 p-4"
              >
                <summary class="cursor-pointer font-medium text-profundo-700">
                  Detalle de los NSS (opcional)
                </summary>
                <div class="mt-3">
                  <FaseUnificacionNss
                    :cliente-id="id"
                    :correccion="correccionNss"
                    @correccion="correcciones = [...correcciones, $event]"
                  />
                </div>
              </details>

              <FaseRecuperacion
                v-else
                :cliente-id="id"
              />
            </template>
          </FaseCorreccion>
        </template>
      </div>
    </div>
  </section>
</template>
