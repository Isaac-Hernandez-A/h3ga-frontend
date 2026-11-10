import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import LoginPage from '~/pages/login.vue'

describe('Tarea F1: proyecto base', () => {
  it('la página de inicio de sesión monta y muestra un formulario con correo y contraseña', async () => {
    const wrapper = await mountSuspended(LoginPage)

    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('input[type="email"]').exists()).toBe(true)
    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
  })
})
