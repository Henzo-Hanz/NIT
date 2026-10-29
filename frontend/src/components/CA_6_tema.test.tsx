import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { HeaderBar } from './HeaderBar'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
  localStorage.clear()
})

describe('CA-6: tema claro/escuro com persistência', () => {
  it('com storage limpo, inicia claro; alterna para escuro e persiste', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <HeaderBar />
      </MemoryRouter>,
    )
    expect(document.documentElement.classList).not.toContain('dark')
    await user.click(screen.getByTestId('toggle-tema'))
    expect(document.documentElement.classList).toContain('dark')
    expect(localStorage.getItem('nit-tema')).toBe('escuro')
  })

  it('com tema salvo como escuro, inicia no modo escuro', async () => {
    const user = userEvent.setup()
    localStorage.setItem('nit-tema', 'escuro')
    render(
      <MemoryRouter>
        <HeaderBar />
      </MemoryRouter>,
    )
    expect(document.documentElement.classList).toContain('dark')
    await user.click(screen.getByTestId('toggle-tema'))
    expect(document.documentElement.classList).not.toContain('dark')
    expect(localStorage.getItem('nit-tema')).toBe('claro')
  })
})
