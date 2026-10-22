import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HeaderBar } from './HeaderBar'

describe('CA-2: header institucional com nav e selo de status', () => {
  it('exibe NIT, tagline, 4 itens de nav e o selo', () => {
    render(<HeaderBar />)
    expect(screen.getByTestId('wordmark-nit')).toHaveTextContent('NIT')
    expect(screen.getByTestId('tagline-nit')).toHaveTextContent('Governo do Piauí · FAPEPI')
    expect(screen.getByTestId('nav-início')).toBeInTheDocument()
    expect(screen.getByTestId('nav-observatório')).toBeInTheDocument()
    expect(screen.getByTestId('nav-pesquisadores')).toBeInTheDocument()
    expect(screen.getByTestId('nav-acesso-do-gestor')).toBeInTheDocument()
    expect(screen.getByTestId('selo-status')).toBeInTheDocument()
  })
})
