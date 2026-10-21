import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FooterBar } from './FooterBar'

describe('CA-4: footer com attribution e links institucionais', () => {
  it('exibe attribution dos tiles e os links Termos e Aviso', () => {
    render(<FooterBar />)
    expect(screen.getByTestId('footer-atribuicao')).toHaveTextContent('OpenStreetMap')
    expect(screen.getByTestId('footer-atribuicao')).toHaveTextContent('CARTO')
    const termos = screen.getByTestId('footer-termos')
    expect(termos).toHaveTextContent('Termos e Condições')
    expect(termos).toHaveAttribute('href')
    expect(screen.getByTestId('footer-aviso')).toHaveTextContent('Aviso de Privacidade')
  })
})
