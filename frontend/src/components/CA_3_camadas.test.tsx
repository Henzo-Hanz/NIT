import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CamadasPanel } from './CamadasPanel'
import type { TipoGeometria } from '../lib/api'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CA-3: painel de camadas com filtros reais por tipo de geometria', () => {
  it('inicia com os três tipos ligados e alterna via callback', async () => {
    const user = userEvent.setup()
    const camadasIniciais: Record<TipoGeometria, boolean> = {
      ponto: true,
      linha: true,
      poligono: true,
    }
    const aoAlternar = vi.fn()
    render(<CamadasPanel camadasAtivas={camadasIniciais} aoAlternar={aoAlternar} />)
    expect(screen.getByTestId('camada-ponto')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('camada-linha')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('camada-poligono')).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByTestId('camada-ponto'))
    expect(aoAlternar).toHaveBeenCalledWith('ponto')
  })
})
