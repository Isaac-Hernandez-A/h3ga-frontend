# Frontend (Actividad 4, fase 1): plan de implementación

> **Para Claude Code (repositorio `h3ga-frontend`):** ejecuta las tareas en orden, una por vez. Si tienes las skills superpowers, usa `executing-plans`; si no, sigue el "Ciclo de cada tarea". No avances sin mi confirmación.

**Objetivo:** construir en Nuxt las pantallas de la fase 1 (login, usuarios y roles, clientes, expediente con etapas y PDF del F0, agenda, avisos y reportes) sobre la API del backend, con pruebas unitarias y de extremo a extremo.

**Arquitectura:** Nuxt como aplicación de navegador (`ssr: false`) que llama directo a la API con `Authorization: Bearer`. Un almacén de sesión guarda el token en memoria y en `sessionStorage`; un solo composable de acceso a la API centraliza cabecera y errores; un middleware impone sesión y rol; el menú depende del rol. Los tipos se generan desde el Swagger del backend.

**Tecnologías:** la última versión estable de Nuxt (verifícala al crear el proyecto), Nuxt UI, Pinia, TypeScript, Vitest con Vue Test Utils, Playwright, `openapi-typescript`, pnpm.

**Especificación:** `docs/superpowers/specs/2026-11-09-actividad-4-frontend-design.md` (cópiala a `docs/` de este repositorio). **Prerrequisito:** las tareas B1 y B2 del plan de backend (login, CORS y usuario inicial) deben estar hechas antes de la Tarea F2; B3 y B4 antes de la F5 y la F6.

## Restricciones globales

- Texto de la interfaz en español. Solo Chrome de escritorio (RNF-08).
- El token vive solo en memoria y `sessionStorage`; nunca en `localStorage`, ni en la URL, ni en los registros.
- Toda llamada a la API pasa por `useApi()`; no uses `fetch` directo en las pantallas. Sin `any` en respuestas de la API: usa los tipos generados.
- La dirección de la API sale de `NUXT_PUBLIC_API_BASE`. No guardes secretos ni credenciales en el repositorio.
- Las capturas y las pruebas usan solo datos ficticios.
- El menú oculta lo que no corresponde al rol, pero asume que el backend es quien impone los permisos: maneja siempre el 403.
- Wireframes: antes de cada pantalla abre `docs/wireframes/<vista>.png` como referencia de estructura. Si no coincide con la especificación o con el contrato de la API, gana la especificación y me preguntas.
- No agregues dependencias fuera de las de este plan sin preguntarme. Las previstas: `nuxt`, `@nuxt/ui`, `pinia`, `@pinia/nuxt`, `vitest`, `@vue/test-utils`, `happy-dom`, `@playwright/test`, `openapi-typescript`.
- Línea base: cada tarea deja todas las pruebas anteriores en verde y `pnpm lint` sin errores.

## Enfoque de revisión

1. Un usuario ve datos del usuario anterior después de cerrar sesión o de que venza el token. Pruebas: CF-02 y CF-22.
2. Un bucle de redirecciones entre `/login` y una pantalla protegida. Prueba: CF-06.
3. El token se filtra a la URL, a un registro o a `localStorage`. Pruebas: CF-01 y CF-13.
4. Se confía en el menú oculto como si fuera seguridad: un 403 rompe la pantalla en lugar de avisar. Prueba: CF-04.
5. Un cambio de estatus que el backend rechaza deja la pantalla con datos viejos. Prueba: CF-09.

## Ciclo de cada tarea

- [ ] **Paso 1:** escribe las pruebas de la tarea (abajo) y comprueba que fallan por la razón correcta.
- [ ] **Paso 2:** implementa lo mínimo para que pasen.
- [ ] **Paso 3:** `pnpm test` y `pnpm lint` completos, en verde.
- [ ] **Paso 4:** si la tarea es una pantalla, ábrela en el navegador, compárala con su wireframe y dime las diferencias.
- [ ] **Paso 5:** commit solo cuando yo confirme.

---

### Tarea F1: Proyecto base

**Archivos:** crear el proyecto Nuxt en el repositorio vacío: `nuxt.config.ts` (`ssr: false`, módulos de Nuxt UI y Pinia, `runtimeConfig.public.apiBase`), `app/` (o la estructura de la versión elegida), `.env.example`, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml` (lint y pruebas unitarias), `docs/wireframes/` (vacía, con un README), scripts `dev`, `build`, `lint`, `test`, `test:e2e` y `api:types` (genera `types/api.d.ts` con `openapi-typescript` desde `${NUXT_PUBLIC_API_BASE}/api/docs-json`).

**Pruebas:**

```ts
it('la página de inicio de sesión monta y muestra un formulario con correo y contraseña', ...)   // prueba de humo con Vitest
```

- [ ] **Commit:** `chore: proyecto Nuxt base con Nuxt UI, Pinia, pruebas y CI`

---

### Tarea F2: Sesión, acceso a la API y login

**Archivos:** `stores/session.ts`, `composables/useApi.ts`, `middleware/auth.global.ts`, `utils/permisos.ts`, `pages/login.vue`; pruebas en `tests/unit/`.

**Interfaces:**
- `useSessionStore()`: `{ token, usuario: { id, nombre, rol }, expiraEn, iniciarSesion(correo, contrasena), cerrarSesion(motivo?), estaVigente }`. Persiste en `sessionStorage` y se rehidrata al recargar.
- `useApi()`: `{ get<T>(ruta, opciones?), post<T>(ruta, cuerpo), put<T>(ruta, cuerpo), patch<T>(ruta, cuerpo), descargar(ruta, nombreSugerido?) }`. Lanza `ApiError { status: number; mensaje: string; campos?: Record<string, string> }`.
- `utils/permisos.ts`: `rutasPermitidas(rol): string[]` y `puede(rol, accion): boolean` (la misma tabla de roles de la especificación).
- Reglas: 401 limpia la sesión y redirige a `/login`; 403 muestra "no tienes permiso" sin cerrar sesión; 400 con arreglo de mensajes se convierte en errores por campo; error de red muestra un aviso. Si la sesión vence, cierra y redirige con mensaje.

**Pruebas:**

```ts
it('CF-01 iniciar sesión guarda token y usuario en sessionStorage y en el almacén; no usa localStorage', ...)
it('CF-02 al vencer el token se cierra la sesión, se limpian los datos y se redirige a /login con mensaje', ...)
it('CF-03 useApi agrega Authorization: Bearer a cada petición', ...)
it('CF-04 401 limpia la sesión y redirige; 403 muestra aviso sin cerrar sesión', ...)
it('CF-05 un 400 con arreglo de mensajes se convierte en errores por campo', ...)
it('CF-06 sin sesión redirige a /login; con rol no permitido redirige al inicio; sin bucles', ...)
it('CF-08 el formulario de login valida campos obligatorios y muestra el error genérico del 401', ...)
```

- [ ] **Commit:** `feat(auth): sesión, composable de API, middleware de roles y pantalla de login`

---

### Tarea F3: Diseño y menú por rol

**Archivos:** `layouts/default.vue`, `utils/menu.ts`, `components/AvisosBadge.vue`, `pages/index.vue` (redirige según el rol); pruebas en `tests/unit/`.

**Interfaces:** `menuPara(rol): Array<{ etiqueta: string; ruta: string }>`. Asesor: clientes, agenda, avisos, reportes. Auxiliar: clientes, agenda, avisos. Supervisor: clientes, agenda, avisos, reportes, usuarios. `AvisosBadge` muestra el número de avisos pendientes (los pide a `GET /avisos` al cargar y al cambiar de pantalla).

**Pruebas:**

```ts
it('CF-07 menuPara devuelve solo las entradas de cada rol y el Auxiliar no ve Reportes ni Usuarios', ...)
it('el menú renderizado coincide con menuPara y el botón de cerrar sesión limpia la sesión', ...)
```

- [ ] **Commit:** `feat(layout): menú lateral por rol y contador de avisos`

---

### Tarea F4: Usuarios y roles (Supervisor)

**Archivos:** `pages/usuarios/index.vue`, `components/UsuarioFormulario.vue`, `composables/useUsuarios.ts`; pruebas en `tests/unit/`.

**Interfaces:** `useUsuarios(): { listar(), crear(datos), actualizar(id, datos), desactivar(id), catalogos() }` sobre las rutas de usuarios y los catálogos de roles y tipos de asesor. Lee los campos y las reglas de validación del DTO del backend y del diccionario; no inventes campos.

**Pruebas:**

```ts
it('el formulario valida correo y campos obligatorios y muestra los errores por campo que devuelve la API', ...)
it('desactivar un usuario llama a PATCH con activo=false y actualiza la lista', ...)
```

- [ ] **Commit:** `feat(usuarios): panel de usuarios y roles`

---

### Tarea F5: Clientes

**Archivos:** `pages/clientes/index.vue`, `pages/clientes/nuevo.vue`, `components/ClienteFormulario.vue`, `composables/useClientes.ts`; pruebas en `tests/unit/`.

**Interfaces:** `useClientes(): { listar(), obtener(id), crear(datos), actualizar(id, datos), reasignar(id, asesorId) }`. La búsqueda es local, por nombre y CURP, sobre la lista que devuelve la API. Crear solo lo ve el Asesor; reasignar solo el Supervisor. Los catálogos (régimen, ley probable, AFORE) vienen de las rutas de catálogos.

**Pruebas:**

```ts
it('CF-14 la búsqueda filtra por nombre y por CURP, sin distinguir mayúsculas ni acentos', ...)
it('el botón de alta solo aparece para el Asesor y el de reasignar solo para el Supervisor', ...)
it('un 409 por CURP repetida se muestra como error del campo CURP', ...)
```

- [ ] **Commit:** `feat(clientes): listado, búsqueda, alta y reasignación`

---

### Tarea F6a: Expediente, estructura y datos del F0

**Archivos:** `pages/clientes/[id].vue` (pestañas), `components/expediente/DatosCliente.vue`, `HistorialLaboral.vue` (con ISSSTE) y `ObjetivosF0.vue`; pruebas en `tests/unit/`.

**Interfaces:** cada pestaña carga y guarda por su cuenta (guardado parcial, RNF-07). Pestañas por rol: Asesor y Supervisor ven todas; el Auxiliar ve datos, documentos y etapas. Un 404 del cliente muestra "Cliente no encontrado".

**Pruebas:**

```ts
it('CF-12 las pestañas visibles dependen del rol: el Auxiliar ve datos, documentos y etapas, y en etapas no aparece el cambio de estatus', ...)
it('cada pestaña guarda solo su sección y muestra el aviso de éxito o los errores por campo', ...)
```

- [ ] **Commit:** `feat(expediente): pestañas de datos, historial laboral y objetivos del F0`

---

### Tarea F6b: Etapas y cambio de estatus

**Archivos:** `components/expediente/Etapas.vue`, `components/expediente/CambioEstatusModal.vue`; pruebas en `tests/unit/`.

**Interfaces:** muestra las 16 etapas con avance global (la respuesta de `GET .../etapas` es `{ avance_global, etapas }`) y el historial de cada etapa. El modal de cambio de estatus usa el catálogo de estatus. Reglas del formulario: Bloqueado exige motivo; En proceso acepta avance de 20 a 90; Finalizado no pide avance. Tras un cambio, vuelve a cargar etapas y avance global. El botón de cambio solo aparece para el Asesor.

**Pruebas:**

```ts
it('CF-09 Bloqueado exige motivo; En proceso acepta de 20 a 90 y rechaza fuera de rango; Finalizado no pide avance', ...)
it('si el backend rechaza el cambio, la pantalla muestra el error y recarga los datos en vez de dejarlos viejos', ...)
it('el historial de una etapa lista los cambios con estatus anterior, nuevo, usuario y fecha', ...)
```

- [ ] **Commit:** `feat(expediente): etapas, avance global, cambio de estatus e historial`

---

### Tarea F6c: Documentos, auxiliares y PDF del F0

**Archivos:** `components/expediente/Documentos.vue`, `Auxiliares.vue`, botón de descarga del F0 en `[id].vue`; pruebas en `tests/unit/`.

**Interfaces:** documentos: subir (multipart, campo `archivo`, solo PDF, JPG o PNG de hasta 10 MB, validado antes de enviar), listar, descargar y revisar (estatus y observaciones; Auxiliar y Supervisor). Auxiliares: el Asesor autoriza (`auxiliar_id`) y activa o desactiva. PDF: `descargar('/clientes/{id}/diagnostico-inicial/pdf')` guarda el archivo con el nombre de `Content-Disposition`.

**Pruebas:**

```ts
it('CF-13 la descarga de PDF envía el token y guarda el archivo con el nombre de la cabecera', ...)
it('subir rechaza en el navegador un tipo distinto de PDF, JPG o PNG y un archivo de más de 10 MB', ...)
it('autorizar y desactivar a un auxiliar actualiza la lista; solo el Asesor ve esos botones', ...)
```

- [ ] **Commit:** `feat(expediente): documentos, auxiliares autorizados y descarga del PDF del F0`

---

### Tarea F7: Agenda

**Archivos:** `pages/agenda/index.vue`, `components/EventoFormulario.vue`, `composables/useAgenda.ts`; pruebas en `tests/unit/`.

**Interfaces:** listar con filtro por fecha, agendar con selector de clientes (los de `GET /clientes`), reagendar, cumplir y cancelar. Solo el Asesor escribe; los demás roles ven la lista sin botones de edición.

**Pruebas:**

```ts
it('CF-10 el formulario exige cliente, fecha y tipo; el selector lista solo los clientes que devuelve la API', ...)
it('el Auxiliar y el Supervisor ven la agenda sin botones de edición', ...)
```

- [ ] **Commit:** `feat(agenda): agenda con selector de clientes`

---

### Tarea F8: Avisos

**Archivos:** `pages/avisos/index.vue`, `composables/useAvisos.ts`; ajusta `AvisosBadge.vue`.

**Interfaces:** bandeja con filtros por estatus y tipo, y acción de atender. El contador del menú se actualiza al atender.

**Pruebas:**

```ts
it('CF-11 el contador refleja los avisos pendientes y baja al atender uno', ...)
it('atender un aviso llama a PATCH /avisos/{id}/atender y lo mueve a atendidos', ...)
```

- [ ] **Commit:** `feat(avisos): bandeja de avisos y contador`

---

### Tarea F9: Reportes

**Archivos:** `pages/reportes/index.vue`, `composables/useReportes.ts`.

**Interfaces:** selector de periodo (semanal o mensual) y fecha; muestra las secciones del reporte (cartera por etapa y estatus, finalizados, vencidos y por vencer, tasa de rechazo con motivos, clientes nuevos por régimen y, solo para el Supervisor, avance por asesor) y el botón de descargar el PDF.

**Pruebas:**

```ts
it('el selector arma la consulta con periodo y fecha, y el desglose por asesor solo aparece si la respuesta lo trae', ...)
it('la descarga del PDF usa el mismo periodo y fecha que la vista', ...)
```

- [ ] **Commit:** `feat(reportes): reporte operativo con descarga en PDF`

---

### Tarea F10: Extremo a extremo, capturas y reporte de pruebas

**Archivos:** `tests/e2e/*.spec.ts`, `tests/e2e/ayudas.ts` (crea los datos de prueba por la API con el Supervisor inicial: usuarios, clientes, autorizaciones, eventos), `scripts/reporte-pruebas.mjs`, `docs/pruebas-resultados-frontend.md`, `docs/capturas/`.

**Interfaces:** Playwright usa `webServer` para el frontend y espera la API en `NUXT_PUBLIC_API_BASE`, levantada aparte con la base de pruebas. El script genera `docs/pruebas-resultados-frontend.md` con el mismo formato del reporte del backend (suites y casos `CF-xx`) y guarda capturas de pantalla con datos ficticios.

**Pruebas:**

```ts
test('CF-15 Asesor: entra, crea un cliente, abre su expediente, cambia el estatus de una etapa y ve el historial', ...)
test('CF-16 Asesor: descarga el PDF del F0 y su contenido empieza con %PDF-', ...)
test('CF-17 Asesor: agenda un evento y lo reagenda', ...)
test('CF-18 Auxiliar: ve solo clientes autorizados, sube un documento, ve las etapas en solo lectura y no ve Reportes ni Usuarios', ...)
test('CF-19 Supervisor: crea y desactiva un usuario y reasigna un cliente', ...)
test('CF-20 Supervisor: genera el reporte semanal y descarga su PDF', ...)
test('CF-21 aparece un aviso para un compromiso a 2 días y se atiende', ...)
test('CF-22 una ruta sin permiso redirige; con token vencido se vuelve al login', ...)
```

- [ ] **Paso 3:** guarda una captura por pantalla principal (login, usuarios, clientes, expediente con etapas, agenda, avisos, reportes y el PDF descargado) en `docs/capturas/`.
- [ ] **Commit:** `test(e2e): flujos por rol, capturas y reporte de pruebas del frontend`

---

## Cobertura de la especificación

- Sección 5 (estructura, sesión, API, menú): F1 a F3. Pantallas: F4 (usuarios), F5 (clientes), F6a a F6c (expediente), F7 (agenda), F8 (avisos), F9 (reportes). Sección 7 (CF-01 a CF-22): F2 a F10. Fases 2 y 3 (correcciones y F1): fuera de este plan.
