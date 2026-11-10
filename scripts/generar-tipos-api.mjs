// Genera types/api.d.ts desde el Swagger del backend (D5).
import { execFileSync } from 'node:child_process'

const base = process.env.NUXT_PUBLIC_API_BASE ?? 'http://localhost:3001'
const origen = `${base.replace(/\/$/, '')}/api/docs-json`

console.log(`Generando types/api.d.ts desde ${origen}`)
execFileSync('pnpm', ['exec', 'openapi-typescript', origen, '-o', 'types/api.d.ts'], {
  stdio: 'inherit',
  shell: true,
})
