import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { HeaderBar } from './HeaderBar'

describe('CA-2: header institucional com nav e selo de status', () => {
  it('exibe NIT, tagline, 4 itens de nav e o selo', () => {
    render(
      <MemoryRouter>
        <HeaderBar />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('wordmark-nit')).toHaveTextContent('NIT')
    expect(screen.getByTestId('logo-institucional')).toHaveAttribute(
      'src',
      '/images/logos/logo_unificada.png',
    )
    expect(screen.getByTestId('nav-início')).toBeInTheDocument()
    expect(screen.getByTestId('nav-espécies')).toBeInTheDocument()
    expect(screen.getByTestId('nav-pesquisadores')).toBeInTheDocument()
    expect(screen.getByTestId('nav-acesso-do-gestor')).toBeInTheDocument()
    expect(screen.getByTestId('selo-status')).toBeInTheDocument()
  })
})
