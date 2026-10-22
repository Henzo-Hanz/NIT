import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CamadasPanel } from './CamadasPanel'

describe('CA-3: painel de camadas mock alternando on/off', () => {
  it('alterna o estado de uma camada ao clicar', async () => {
    const user = userEvent.setup()
    render(<CamadasPanel />)
    const botaoEspécies = screen.getByTestId('camada-espécies-litorâneas')
    expect(botaoEspécies).toHaveAttribute('aria-pressed', 'false')
    await user.click(botaoEspécies)
    expect(botaoEspécies).toHaveAttribute('aria-pressed', 'true')
    await user.click(botaoEspécies)
    expect(botaoEspécies).toHaveAttribute('aria-pressed', 'false')
  })
})
