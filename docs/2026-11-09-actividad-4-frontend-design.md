# Actividad 4: frontend (fase 1) e inicio de sesión. Especificación de diseño

**Fecha:** 2026-11-09. **Estado:** pendiente de revisión del usuario. **Ruta de brainstorming:** arquitectónica.
**Repositorios:** `h3ga-backend` (NestJS, existente) y `h3ga-frontend` (Nuxt, vacío salvo README y `.gitignore`).

## 1. Objetivo y criterio de éxito

Construir las interfaces del sistema (objetivo específico 6) y el inicio de sesión que las alimenta, de modo que un usuario pueda entrar con su correo y contraseña y operar, según su rol, las funciones que el backend ya implementa. Éxito significa:

- Un Asesor, un Auxiliar y un Supervisor entran, ven solo lo que les corresponde y completan su flujo principal en el navegador (Chrome de escritorio, RNF-08).
- Todo está probado: pruebas del backend (continuando en CP-69), pruebas del frontend (CF-01 en adelante) y un reporte unificado para la Memoria.
- Las limitaciones se declaran tal como son.

Fecha de congelamiento del código: 17 de noviembre de 2026. La Memoria se entrega el 20.

## 2. Decisiones tomadas

- D1. El endpoint de login vive en `h3ga-backend`, como módulo `auth`. `h3ga-frontend` solo tiene la pantalla.
- D2. El frontend es Nuxt en modo navegador (sin renderizado en servidor) y llama directo a la API con `Authorization: Bearer`. El token se guarda en memoria y en `sessionStorage`.
- D3. Componentes de interfaz: Nuxt UI. Estado: Pinia. La versión de Nuxt es la última estable, verificada al crear el proyecto.
- D4. Pruebas: Vitest con Vue Test Utils y API simulada, más Playwright contra la API real y la base de pruebas.
- D5. Los tipos del frontend se generan desde el Swagger del backend (`/api/docs-json`).
- D6. El alcance se divide en fases (sección 3). Solo la fase 1 está especificada aquí.
- D7. Vigencia del token: 8 horas, sin renovación y sin ruta `/auth/me`.
- D8. Las respuestas de error del login no distinguen entre correo inexistente, contraseña incorrecta y usuario inactivo.
- D9. El Auxiliar puede leer las etapas y su historial en los clientes que el Asesor le autoriza (solo lectura). Esto alinea el código con el RF-18, que ya lo establece; hoy `etapas.leer` no incluye al Auxiliar.

## 3. Alcance por fases

**Fase 1 (esta especificación):** login, usuarios y roles, clientes, expediente del cliente (datos, historial laboral e ISSSTE, objetivos del F0, documentos, etapas con cambio de estatus e historial, auxiliares autorizados, PDF del F0), agenda, avisos y reportes.

**Fase 2 (después, con su propia especificación):** correcciones F2, F3 y F4, incluidas las rutas de backend de listado, detalle y edición.

**Fase 3 (solo si sobra tiempo):** diagnóstico F1. Si no se hace, el wireframe queda como diseño y la Memoria lo declara.

**Fuera de alcance de todas las fases:** renovación de token, recuperación de contraseña, protección contra intentos repetidos de login, despliegue (DigitalOcean no está activo), HTTPS en local y cualquier pantalla que simule datos.

**Orden de recorte si falta tiempo:** primero reportes; luego las pestañas de documentos y de auxiliares del expediente; luego el PDF del F0. No se recorta: login, usuarios y roles, agenda y avisos (objetivo 6), ni clientes con etapas y cambio de estatus.

## 4. Backend: cambios

Todo con pruebas primero, con el mismo ciclo y restricciones del plan de la Actividad 3 (nombres exactos del diccionario, sin editar migraciones existentes, solo base local, `America/Cancun`).

**4.1 Módulo `auth`.** `POST /api/v1/auth/login` (ruta pública) recibe `correo_electronico` y `contrasena`. Busca el usuario, exige `activo = true` y compara con `contrasena_hash` usando bcryptjs (se agrega `verify` a la interfaz `PasswordHasher` existente). Responde 200 con `access_token`, `expires_in` (28800 s) y `usuario: { id, nombre, rol }`. El token es HS256, firmado con `JWT_SECRET`, con los datos que los guards ya validan: `sub` (id del usuario), `rol` (el valor normalizado que ya usa `normalizar-rol.ts`) y `exp`. Correo inexistente, contraseña incorrecta y usuario inactivo responden el mismo 401 con el mismo mensaje. Cuerpo inválido responde 400. El hash nunca aparece en una respuesta.

**4.2 CORS.** Solo para los orígenes de la variable `CORS_ORIGINS` (por defecto `http://localhost:3000`), sin comodines, con las cabeceras `Authorization` y `Content-Type`, y exponiendo `Content-Disposition` para el nombre de las descargas de PDF.

**4.3 Usuario inicial.** Un script (`pnpm db:seed:supervisor`) crea un Supervisor con correo y contraseña tomados del entorno. No guarda la contraseña en el repositorio y puede repetirse sin duplicar.

**4.4 Permiso de lectura de etapas para el Auxiliar.** En `permisos.ts`, `etapas.leer` pasa a Asesor, Auxiliar y Supervisor; `ClienteAccessGuard` ya limita al Auxiliar a los clientes con autorización activa. `etapas.escribir` sigue solo para el Asesor. Rutas afectadas: `GET /clientes/:clienteId/etapas` y `GET /clientes/:clienteId/etapas/:etapaTramiteId/historial`. Se actualizan los comentarios de `permisos.ts` y la fila de etapas de `docs/arquitectura.md`.

**4.5 Lecturas de apoyo que hoy responden 501** y las pantallas necesitan (consultas simples sobre tablas existentes, con los roles que ya declara `permisos.ts`):
- Catálogos: `GET /catalogos/estatus`, `/catalogos/regimenes`, `/catalogos/leyes-probables`, `/catalogos/afores`, `/catalogos/tipos-documento` y `/catalogos/objetivos-especificos`. Los tres roles pueden leerlos.
- Cliente: `GET /clientes/:clienteId/historial-laboral`, `/historial-laboral/issste`, `/objetivos-especificos` y `/auxiliares`, con los roles que ya declara el contrato (Asesor dueño y Supervisor; el Auxiliar recibe 403).

El contrato pasa de 84 a 85 rutas (se suma el login); las demás son rutas que dejan de ser 501.

## 5. Frontend: diseño

**Estructura.** Nuxt en modo navegador con Nuxt UI; un almacén de sesión (Pinia) con token, usuario y vencimiento; un composable de acceso a la API; middleware de sesión y de rol; un diseño con menú lateral según el rol.

**Sesión.** El login guarda el token y los datos del usuario en `sessionStorage` y en el almacén. Al vencer el token se cierra la sesión sola y se muestra un mensaje antes de ir a `/login`.

**Acceso a la API.** Un solo composable agrega `Authorization`, usa la dirección de `NUXT_PUBLIC_API_BASE` y centraliza errores: 401 limpia la sesión y redirige a `/login`; 403 muestra "no tienes permiso" sin cerrar sesión; 400 con arreglo de mensajes se mapea a errores por campo; error de red muestra un aviso en lugar de quedarse cargando.

**Menú por rol.** Asesor: clientes, agenda, avisos y reportes. Auxiliar: clientes (solo los autorizados), agenda en lectura y avisos. Supervisor: todo lo anterior más usuarios. El menú oculta lo que no corresponde, pero el backend impone los permisos.

**Pantallas:**
- Login: `POST /auth/login`.
- Usuarios y roles (Supervisor): listado, alta, edición y desactivación; catálogos de roles y tipos de asesor.
- Clientes: listado (la API lo filtra por rol), búsqueda local por nombre y CURP, alta (Asesor) y reasignación de asesor (Supervisor).
- Expediente del cliente, en pestañas con guardado parcial (RNF-07): datos (consulta y edición), historial laboral e ISSSTE, objetivos del F0, documentos (subir, descargar, revisar), etapas (lista con avance global, cambio de estatus con motivo para Bloqueado y avance de 20 a 90 para En proceso, e historial de cambios), auxiliares autorizados (Asesor autoriza y desactiva) y el botón de descarga del PDF del F0. Las pestañas visibles dependen del rol: el Auxiliar ve datos, documentos y etapas, estas últimas en solo lectura (sin cambio de estatus).
- Agenda: listar con filtro por fecha, agendar con selector de clientes, reagendar, cumplir y cancelar (el Asesor escribe; los demás leen).
- Avisos: bandeja y marcar atendido, con un contador de pendientes en el menú.
- Reportes (Asesor y Supervisor): periodo semanal o mensual y fecha, vista de las secciones del reporte y descarga del PDF.

**Descargas de PDF.** Se piden con el token, se reciben como archivo y se guardan con el nombre de `Content-Disposition`.

## 6. Errores, seguridad y límites declarados

- Cada pantalla tiene estados de carga, vacío y error, con mensajes en español.
- El token nunca va en la URL; el frontend no guarda secretos, solo la dirección de la API.
- Límites que la Memoria declara: el token en `sessionStorage` es vulnerable a XSS; el login no tiene protección contra intentos repetidos; no hay renovación de token; el frontend corre sin HTTPS en local (RNF-03 queda sin verificar hasta el despliegue); no se probó en otro navegador que no sea Chrome.

## 7. Pruebas

**Backend (Jest, primero las pruebas), de CP-69 a CP-81:**
- CP-69: login correcto responde 200 con token, vigencia y usuario; el token tiene `sub`, `rol` y `exp` a 8 horas.
- CP-70: el token emitido lo acepta el guard existente en `GET /clientes` para cada rol.
- CP-71: contraseña incorrecta, correo inexistente y usuario inactivo responden el mismo 401 con el mismo mensaje.
- CP-72: ninguna respuesta del login incluye `contrasena_hash`.
- CP-73: cuerpo sin correo o sin contraseña responde 400.
- CP-74: CORS permite el origen configurado y no concede permiso a otro origen.
- CP-75: el script de usuario inicial crea un Supervisor que puede iniciar sesión y repetirlo no duplica.
- CP-76: los catálogos nuevos los leen los tres roles; sin token, 401.
- CP-77: historial laboral, ISSSTE y objetivos de un cliente: Asesor dueño 200, Asesor ajeno 404, Auxiliar 403, Supervisor 200; un cliente sin datos responde vacío, nunca 500.
- CP-78: auxiliares del cliente: Asesor dueño y Supervisor 200, Auxiliar 403.
- CP-79: la matriz de acceso cubre las rutas nuevas y ninguna responde 500.
- CP-80: un token vencido emitido por el login responde 401 en una ruta protegida (reloj controlado).
- CP-81: el Auxiliar con autorización activa lee las etapas y el historial de un cliente (200); sin autorización o con autorización inactiva recibe 404; intentar cambiar el estatus sigue respondiendo 403 (CP-28).

**Frontend, unitarias (Vitest, API simulada):**
- CF-01: el login guarda token y usuario en `sessionStorage` y en el almacén.
- CF-02: al vencer el token se cierra la sesión y se redirige a `/login` con mensaje.
- CF-03: el composable agrega `Authorization` a cada petición.
- CF-04: 401 limpia la sesión y redirige; 403 muestra aviso sin cerrar sesión.
- CF-05: un 400 con arreglo de mensajes se convierte en errores por campo.
- CF-06: el middleware redirige a `/login` sin sesión, y al inicio con rol no permitido.
- CF-07: el menú muestra solo las entradas de cada rol.
- CF-08: el formulario de login valida campos obligatorios y muestra el error genérico del 401.
- CF-09: cambio de estatus: Bloqueado exige motivo; En proceso acepta de 20 a 90 y rechaza fuera de rango.
- CF-10: el formulario de agenda exige cliente, fecha y tipo; el selector lista solo los clientes que devuelve la API.
- CF-11: el contador de avisos refleja los pendientes y baja al atender.
- CF-12: las pestañas del expediente dependen del rol (el Auxiliar ve datos, documentos y etapas, y en etapas no aparece el cambio de estatus).
- CF-13: la descarga de PDF envía el token y guarda el archivo con el nombre de la cabecera.
- CF-14: la búsqueda local de clientes filtra por nombre y CURP.

**Frontend, extremo a extremo (Playwright, API real, base de pruebas, datos ficticios):**
- CF-15: Asesor: entra, crea un cliente, abre el expediente, cambia el estatus de una etapa y ve el historial.
- CF-16: Asesor: descarga el PDF del F0 y su contenido empieza con `%PDF-`.
- CF-17: Asesor: agenda un evento y lo reagenda.
- CF-18: Auxiliar: ve solo clientes autorizados, sube un documento, ve las etapas en solo lectura y no ve Reportes ni Usuarios.
- CF-19: Supervisor: crea y desactiva un usuario y reasigna un cliente.
- CF-20: Supervisor: genera el reporte semanal y descarga su PDF.
- CF-21: aparece un aviso para un compromiso a 2 días y se atiende.
- CF-22: una ruta sin permiso redirige; con token vencido se vuelve al login.

**Evidencia para la Memoria:** el reporte de pruebas del backend ampliado, el del frontend con el mismo formato (suites y casos), y capturas de pantalla tomadas por Playwright con datos ficticios (login, usuarios, clientes, expediente con etapas, agenda, avisos, reportes y el PDF descargado).

## 8. Implicaciones para la Memoria (fuera del código)

- El módulo de autenticación pasa a construirse en este proyecto. Las frases que hoy lo atribuyen solo a "otro estudiante" (alcance de la Actividad 1, Actividades 2 y 3, objetivo específico 5) deben describir quién hizo qué.
- El objetivo específico 6 promete agenda, avisos y panel de roles; la fase 1 lo supera. Si no se hace F1, el wireframe de diagnósticos se declara como diseño.
- La declaración de uso de IA debe incluir el desarrollo del frontend y del login.
- Los límites de la sección 6 pasan a la sección de limitaciones de la actividad.

## 9. Autorrevisión

- Marcadores sin resolver: ninguno. La versión de Nuxt se fija al crear el proyecto, y el nombre exacto de cada archivo lo decide el plan, no esta especificación.
- Consistencia: el contrato pasa de 84 a 85 rutas; las 10 lecturas de apoyo no suman rutas, solo cambian de 501 a implementadas.
- Alcance: una sola especificación para la fase 1; correcciones y F1 quedan en especificaciones propias.
- Ambigüedad: "Auxiliar ve etapas" queda resuelto por decisión del usuario: las ve en solo lectura y solo en clientes autorizados (D9, sección 4.4).
