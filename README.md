# h3ga-frontend
Frontend del sistema H3GA Seguros y Pensiones (Nuxt)

## Despliegue (DigitalOcean App Platform, sitio estático)

| Campo | Valor |
|---|---|
| Tipo de componente | Static Site |
| Gestor de paquetes / Node | pnpm 10.34.9 (campo `packageManager`) / Node 24.x (campo `engines`) |
| Build command | `pnpm install --frozen-lockfile && pnpm generate` |
| Output directory | `.output/public` |
| Catchall document | `200.html` (también sirve `index.html`) |
| Variable (BUILD_TIME) | `NUXT_PUBLIC_API_BASE=https://h3ga-backend-2bbfj.ondigitalocean.app/api/v1` |

La URL de la API se lee al **generar** (build), no en ejecución: queda escrita en el sitio. Si cambia, hay que volver a desplegar.
Es un sitio estático: el backend debe permitir el origen del frontend en CORS.
