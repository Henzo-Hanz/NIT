import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderBar } from './HeaderBar'
import { TooltipDescricao } from './ui/tooltip'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllTimers()
  cleanup()
  localStorage.clear()
})

function avancar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function renderizarComTooltip(descricao = 'Descrição de teste') {
  render(
    <TooltipDescricao descricao={descricao}>
      <button type="button">Alvo</button>
    </TooltipDescricao>,
  )
  return screen.getByText('Alvo')
}

describe('descrições das ferramentas (hover de 2s)', () => {
  it('só mostra a caixa depois de 1,7s de hover', () => {
    const alvo = renderizarComTooltip()
    fireEvent.mouseEnter(alvo)
    avancar(1699)
    expect(screen.queryByTestId('tooltip-descricao')).toBeNull()
    avancar(1)
    expect(screen.getByTestId('tooltip-descricao')).toHaveTextContent('Descrição de teste')
  })

  it('não mostra a caixa quando o mouse sai antes de 1,7s', () => {
    const alvo = renderizarComTooltip()
    fireEvent.mouseEnter(alvo)
    avancar(1500)
    fireEvent.mouseLeave(alvo)
    avancar(5000)
    expect(screen.queryByTestId('tooltip-descricao')).toBeNull()
  })

  it('esconde a caixa quando o mouse sai e reinicia a contagem ao voltar', () => {
    const alvo = renderizarComTooltip()
    fireEvent.mouseEnter(alvo)
    avancar(1700)
    expect(screen.getByTestId('tooltip-descricao').className).toContain('opacity-100')
    fireEvent.mouseLeave(alvo)
    expect(screen.getByTestId('tooltip-descricao').className).toContain('opacity-0')
    fireEvent.mouseEnter(alvo)
    avancar(1699)
    expect(screen.getByTestId('tooltip-descricao').className).toContain('opacity-0')
    avancar(1)
    expect(screen.getByTestId('tooltip-descricao').className).toContain('opacity-100')
  })

  it('a caixa segue o design system: rounded-lg, card, borda e sombra', () => {
    const alvo = renderizarComTooltip()
    fireEvent.mouseEnter(alvo)
    avancar(1700)
    const caixa = screen.getByTestId('tooltip-descricao')
    for (const classe of ['rounded-lg', 'bg-card', 'border', 'shadow-sm', 'text-xs', 'pointer-events-none']) {
      expect(caixa.className).toContain(classe)
    }
    expect(caixa.className).not.toContain('gradient')
  })
})

describe('botão de ativar/desativar descrições', () => {
  it('desliga as descrições, persiste e volta a ligar', () => {
    render(
      <MemoryRouter>
        <HeaderBar />
      </MemoryRouter>,
    )
    const toggle = screen.getByTestId('toggle-descricoes')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(localStorage.getItem('nit-descricoes')).toBe('desligado')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('nit-descricoes')).toBe('ligado')
  })

  it('restaura a preferência desligada do localStorage', () => {
    localStorage.setItem('nit-descricoes', 'desligado')
    render(
      <MemoryRouter>
        <HeaderBar />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('toggle-descricoes')).toHaveAttribute('aria-pressed', 'false')
  })

  it('com descrições desligadas, o hover não abre a caixa', () => {
    localStorage.setItem('nit-descricoes', 'desligado')
    const alvo = renderizarComTooltip()
    fireEvent.mouseEnter(alvo)
    avancar(5000)
    expect(screen.queryByTestId('tooltip-descricao')).toBeNull()
  })

  it('o próprio botão de descrições mostra a explicação mesmo com as dicas desligadas', () => {
    localStorage.setItem('nit-descricoes', 'desligado')
    render(
      <MemoryRouter>
        <HeaderBar />
      </MemoryRouter>,
    )
    const toggle = screen.getByTestId('toggle-descricoes')
    expect(toggle).toHaveAttribute('data-ativo', 'false')
    fireEvent.mouseEnter(toggle)
    avancar(1700)
    expect(screen.getByTestId('tooltip-descricao')).toHaveTextContent(
      'Liga ou desliga as descrições das ferramentas e menus',
    )
  })

  it('o botão mostra estado visível: olho aberto ligado, riscado desligado', () => {
    render(
      <MemoryRouter>
        <HeaderBar />
      </MemoryRouter>,
    )
    const toggle = screen.getByTestId('toggle-descricoes')
    expect(toggle.textContent).toContain('Dicas')
    expect(toggle).toHaveAttribute('data-ativo', 'true')
    expect(toggle.querySelector('.line-through')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('data-ativo', 'false')
    expect(toggle.querySelector('.line-through')).not.toBeNull()
  })
})
