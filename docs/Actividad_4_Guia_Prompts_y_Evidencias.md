# Actividad 4: guía, prompts para Claude Code y evidencias

**Actividad:** Interfaces frontend (objetivo específico 6), más el inicio de sesión.
**Documentos:** especificación `2026-11-09-actividad-4-frontend-design.md` (qué y por qué), plan de backend `2026-11-09-actividad-4-backend.md` y plan de frontend `2026-11-09-actividad-4-frontend.md` (cómo, paso a paso).

---

## 1. Pasos (en orden)

1. **Antes de empezar, cierra lo pendiente de la Actividad 3:** haz commit y push del arreglo de la matriz de acceso (CP-68), que no estaba subido, y confirma que el CI pase.
2. **Habla con tu compañero:** el login ahora se construye en este proyecto. Acuerden quién hace qué, para que la Memoria lo diga como fue.
3. **Backend:** copia la especificación a `h3ga-backend\docs\superpowers\specs\` y el plan de backend a `docs\superpowers\plans\`. Verifica la línea base (`npx jest`: 267 pasan).
4. **Frontend:** copia la especificación y el plan de frontend a `h3ga-frontend\docs\`, y tus imágenes de Figma a `h3ga-frontend\docs\wireframes\` con un nombre por vista (`roles.png`, `agenda.png`, `avisos.png`, `reportes.png`, `expediente.png`).
5. Ejecuta backend B1 y B2 (login, CORS y usuario inicial). Con eso ya puede arrancar el frontend.
6. Ejecuta frontend F1 a F3 (proyecto, sesión, menú). En paralelo, o después, backend B3 y B4 (catálogos y lecturas).
7. Ejecuta frontend F4 a F9 (pantallas) y backend B5.
8. Ejecuta F10 (extremo a extremo, capturas y reporte de pruebas).
9. Me traes los resultados (sección 4) y redactamos la Actividad 4.

## 2. Prompts

**Arranque del backend** (sesión nueva en `h3ga-backend`):

```text
Lee CLAUDE.md, la especificación docs/superpowers/specs/2026-11-09-actividad-4-frontend-design.md y el plan docs/superpowers/plans/2026-11-09-actividad-4-backend.md. Responde en español.
No escribas código todavía. Resume en 5 líneas qué vas a construir, dime qué dudas tienes sobre el código existente que el plan no resuelva (por ejemplo, el nombre exacto de los campos de usuarios o cómo funciona normalizarRol) y espera mi respuesta.
```

**Por tarea del backend** (cambia el número):

```text
Ejecuta la Tarea B<N> del plan docs/superpowers/plans/2026-11-09-actividad-4-backend.md, siguiendo el "Ciclo de cada tarea".
Reglas: respeta las restricciones globales; no agregues dependencias; no edites migraciones existentes; solo base local.
Paso 2: muéstrame la salida de las pruebas fallando antes de implementar.
Al terminar: resumen corto, archivos cambiados, salida de npx jest completo y diff. No hagas commit hasta que yo lo confirme.
```

**Arranque del frontend** (sesión nueva en `h3ga-frontend`):

```text
Lee la especificación docs/2026-11-09-actividad-4-frontend-design.md y el plan docs/2026-11-09-actividad-4-frontend.md. Los wireframes están en docs/wireframes/. Responde en español.
No escribas código todavía. Resume en 5 líneas qué vas a construir, confirma la versión estable de Nuxt que vas a usar y dime qué dudas tienes. Espera mi respuesta.
```

**Por tarea del frontend** (cambia el número; para las pantallas, el wireframe correspondiente):

```text
Ejecuta la Tarea F<N> del plan docs/2026-11-09-actividad-4-frontend.md, siguiendo el "Ciclo de cada tarea".
Para esta pantalla, abre docs/wireframes/<vista>.png como referencia de estructura. Si no coincide con la especificación o con el contrato de la API, gana la especificación y me preguntas.
Reglas: respeta las restricciones globales; no agregues dependencias fuera de la lista del plan; no uses fetch directo en las pantallas.
Paso 1: muéstrame las pruebas fallando antes de implementar.
Al terminar: resumen corto, archivos cambiados, salida de pnpm test y pnpm lint, y dime en qué se diferencia la pantalla del wireframe. No hagas commit hasta que yo lo confirme.
```

**Cierre (Tarea F10):**

```text
Ejecuta la Tarea F10. La API del backend está corriendo en <dirección> con la base de pruebas y el Supervisor inicial ya creado. Genera docs/pruebas-resultados-frontend.md con node scripts/reporte-pruebas.mjs, muéstrame las tablas y deja las capturas en docs/capturas/ con datos ficticios.
```

## 3. Evidencias de la Actividad 4

Los números de tabla e ilustración se asignan al redactar (la Memoria llega a Tabla 14, Ilustración 24 y Código 1).

- **A4-E1:** diagrama de secuencia del inicio de sesión (formulario, `auth/login`, token, almacén, llamada protegida). Lo genero yo.
- **A4-E2:** diagrama de componentes del frontend (páginas, almacén, composable de API, middleware, menú). Lo genero yo.
- **A4-E3:** tabla de pantallas por rol y rutas de la API que usa cada una (de la especificación).
- **A4-E4:** capturas de las pantallas principales con datos ficticios: login, usuarios, clientes, expediente con etapas, agenda, avisos, reportes y el PDF descargado (de `docs/capturas/`).
- **A4-E5:** comparación de cada wireframe de Figma con su pantalla terminada (roles, agenda, avisos, reportes y expediente), una al lado de la otra. Esto muestra el paso del diseño a la implementación.
- **A4-E6:** tabla de pruebas del backend nuevas (CP-69 a CP-81) con su resultado, de `docs/pruebas-resultados.md`.
- **A4-E7:** tablas de pruebas del frontend (suites y casos CF-01 a CF-22) de `docs/pruebas-resultados-frontend.md`.
- **A4-E8:** tabla de limitaciones declaradas (token en `sessionStorage`, sin protección contra intentos repetidos, sin renovación, sin HTTPS en local, solo Chrome).
- **A4-E9:** Código 1 (opcional, máximo 20 líneas): el núcleo del composable de acceso a la API o del `iniciarSesion` del backend, con título, lenguaje y archivo.

**Qué decir y qué no decir al redactar:**
- Las pantallas de correcciones y de diagnósticos F1 no están en la fase 1. Sus wireframes quedan como diseño y se declara así.
- El login se atribuye como fue: quién lo construyó, quién lo revisó y con qué apoyo.
- La pantalla de expediente cubre el F0 y las etapas; no es el diagnóstico F1.
- Las pruebas de extremo a extremo corren contra una base de pruebas local, no contra un entorno desplegado.

## 4. Lo que me traes para redactar

`docs/pruebas-resultados.md` y `docs/pruebas-resultados-frontend.md`, los `endpoints.md` y `arquitectura.md` regenerados, las capturas, los wireframes junto a sus pantallas, y cualquier decisión que haya cambiado respecto al plan (por ejemplo, la versión de Nuxt o recortes). También tu Memoria más reciente.

## 5. Calendario realista

Hoy es 9 de noviembre; el congelamiento es el 17 y la Memoria se entrega el 20. El lunes 16 es festivo.

- 9 y 10 nov: backend B1 a B5 (B1 y B2 primero).
- 10 y 11 nov: frontend F1 a F3.
- 11 y 12 nov: F4 y F5.
- 12 a 14 nov: F6a, F6b y F6c (el expediente es la pieza más grande).
- 14 y 15 nov: F7, F8 y F9.
- 16 y 17 nov: F10 y capturas.

Es ajustado. Si falta tiempo, el orden de recorte es: reportes (F9), luego documentos y auxiliares del expediente (F6c), luego el botón del PDF del F0. No se recortan login, usuarios y roles, agenda, avisos, clientes ni etapas con cambio de estatus.

## 6. Antes de empezar

- Si Claude Code te propone una dependencia fuera de las previstas, pregúntame.
- Las capturas y las pruebas usan solo datos ficticios.
- Si usas Claude Code para programar, el frontend y el login entran en la declaración de uso de IA del anexo.
