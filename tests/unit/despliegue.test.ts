// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const paquete = JSON.parse(readFileSync('package.json', 'utf8'))
const config = readFileSync('nuxt.config.ts', 'utf8')
const ci = readFileSync('.github/workflows/ci.yml', 'utf8')

describe('despliegue como sitio estático', () => {
  it('genera el SPA con nuxt generate', () => {
    expect(paquete.scripts.generate).toBe('nuxt generate')
  })

  it('fija gestor de paquetes y versión de Node', () => {
    expect(paquete.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
    expect(paquete.engines.node).toBe('24.x')
  })

  it('es un SPA (sin renderizado en servidor)', () => {
    expect(config).toMatch(/ssr:\s*false/)
  })

  it('lee la URL de la API de NUXT_PUBLIC_API_BASE', () => {
    expect(config).toContain('NUXT_PUBLIC_API_BASE')
    expect(readFileSync('.env.example', 'utf8')).toContain('NUXT_PUBLIC_API_BASE=')
  })

  it('el CI comprueba que el sitio estático compila', () => {
    expect(ci).toContain('pnpm generate')
  })
})
