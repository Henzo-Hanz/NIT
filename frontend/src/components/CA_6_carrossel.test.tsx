import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CarrosselEspecie } from './CarrosselEspecie'
import type { EspecieResumo } from '../lib/api'

const ESPECIES = {
  Crustáceo: [
    { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', nome_cientifico: 'Ucides cordatus', imagem: 'biodiversidade/midia/caranguejo-uca.svg' },
    { slug: 'caranguejo-maria-farinha', nome_popular: 'Caranguejo maria-farinha', nome_cientifico: 'Ocypode quadrata', imagem: 'biodiversidade/midia/caranguejo-maria-farinha.svg' },
    { slug: 'guaiamum', nome_popular: 'Guaiamum', nome_cientifico: 'Cardisoma guanhumi', imagem: null },
    { slug: 'siri-azul', nome_popular: 'Siri-azul', nome_cientifico: 'Callinectes sapidus', imagem: null },
  ] as EspecieResumo[],
  Ave: [
    { slug: 'garca-branca', nome_popular: 'Garça-branca-pequena', nome_cientifico: 'Egretta thula', imagem: 'biodiversidade/midia/garca-branca.svg' },
  ] as EspecieResumo[],
  Peixe: [
    { slug: 'tainha', nome_popular: 'Tainha', nome_cientifico: 'Mugil liza', imagem: null },
    { slug: 'robalo', nome_popular: 'Robalo-peba', nome_cientifico: 'Centropomus parallelus', imagem: null },
  ] as EspecieResumo[],
}

const PAINES = [
  { chave: 'Crustáceo', titulo: 'Crustáceos', itens: ESPECIES['Crustáceo'] },
  { chave: 'Ave', titulo: 'Aves', itens: ESPECIES['Ave'] },
  { chave: 'Peixe', titulo: 'Peixes', itens: ESPECIES['Peixe'] },
]

const abrirDoisPaineis = () =>
  PAINES.map((painel, index) => (
    <CarrosselEspecie
      key={painel.chave}
      testid={`carrossel-${painel.chave}`}
      titulo={painel.titulo}
      itens={painel.itens}
      onAbrir={index === 0 ? () => {} : () => {}}
    />
  ))

afterEach(() => {
  cleanup()
})

describe('CA-6: painéis do carrossel de espécies', () => {
  it('tres paineis (Crustáceos/Aves/Peixes) com testids preservados e contador do grupo', () => {
    render(<div>{abrirDoisPaineis()}</div>)
    expect(screen.getByTestId('carrossel-Crustáceo')).toBeInTheDocument()
    expect(screen.getByTestId('carrossel-Ave')).toBeInTheDocument()
    expect(screen.getByTestId('carrossel-Peixe')).toBeInTheDocument()

    expect(screen.getByTestId('carrossel-Crustáceo-contador')).toHaveTextContent('- 4')
    expect(screen.getByTestId('carrossel-Ave-contador')).toHaveTextContent('- 1')
    expect(screen.getByTestId('carrossel-Peixe-contador')).toHaveTextContent('- 2')

    const contador = screen.getByTestId('carrossel-Crustáceo-contador')
    expect(contador.className).toContain('bg-accent')

    expect(screen.getByTestId('card-especie-caranguejo-uca')).toBeInTheDocument()
    expect(screen.getByTestId('card-especie-garca-branca')).toBeInTheDocument()
    expect(screen.getByTestId('card-especie-tainha')).toBeInTheDocument()
  })
})

describe('CA-6: legenda dentro do card ativo', () => {
  it('bloco solido alinhado a esquerda com nome popular e cientifico dentro', () => {
    render(
      <CarrosselEspecie
        testid="carrossel-Crustáceo"
        titulo="Crustáceos"
        itens={ESPECIES['Crustáceo']}
        onAbrir={() => {}}
      />,
    )
    const card = screen.getByTestId('card-especie-caranguejo-uca')
    expect(card.dataset.ativo).toBe('true')

    const legenda = card.querySelector('.bg-black\\/55')
    expect(legenda).not.toBeNull()
    expect(legenda?.className).toContain('text-left')
    expect(legenda?.textContent).toContain('Caranguejo-uçá')
    expect(legenda?.textContent).toContain('Ucides cordatus')
  })

  it('sem player nem barra de progresso', () => {
    render(
      <CarrosselEspecie
        testid="carrossel-Crustáceo"
        titulo="Crustáceos"
        itens={ESPECIES['Crustáceo']}
        onAbrir={() => {}}
      />,
    )
    expect(screen.queryByTestId('carrossel-player')).toBeNull()
    expect(screen.queryByTestId('carrossel-progresso')).toBeNull()
    expect(document.querySelector('[role="progressbar"]')).toBeNull()
  })
})

describe('CA-6: card ativo abre ficha', () => {
  it('clique no card ativo chama onAbrir; lateral apenas navega', () => {
    const onAbrir = vi.fn()
    render(
      <CarrosselEspecie
        testid="carrossel-Crustáceo"
        titulo="Crustáceos"
        itens={ESPECIES['Crustáceo']}
        onAbrir={onAbrir}
      />,
    )
    fireEvent.click(screen.getByTestId('card-especie-caranguejo-uca'))
    expect(onAbrir).toHaveBeenCalledWith('caranguejo-uca')

    fireEvent.click(screen.getByTestId('card-especie-siri-azul'))
    expect(onAbrir).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('card-especie-siri-azul').dataset.ativo).toBe('true')
  })

  it('clicar na lateral ativa ela com wrap-around', () => {
    render(
      <CarrosselEspecie
        testid="carrossel-Crustáceo"
        titulo="Crustáceos"
        itens={ESPECIES['Crustáceo']}
        onAbrir={() => {}}
      />,
    )
    expect(screen.getByTestId('card-especie-caranguejo-uca').dataset.ativo).toBe('true')

    fireEvent.click(screen.getByTestId('card-especie-siri-azul'))
    expect(screen.getByTestId('card-especie-siri-azul').dataset.ativo).toBe('true')

    // Wrap: do último, o card à direita é o primeiro (uçá) — clique o ativa.
    fireEvent.click(screen.getByTestId('card-especie-caranguejo-uca'))
    expect(screen.getByTestId('card-especie-caranguejo-uca').dataset.ativo).toBe('true')
  })
})

describe('CA-6: autoplay do painel (fake timers)', () => {
  it('avanca a cada 3s, pausa no hover e retoma', () => {
    vi.useFakeTimers()
    try {
      render(
        <CarrosselEspecie
          testid="carrossel-Crustáceo"
          titulo="Crustáceos"
          itens={ESPECIES['Crustáceo']}
          onAbrir={() => {}}
        />,
      )
      expect(screen.getByTestId('card-especie-caranguejo-uca').dataset.ativo).toBe('true')

      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(screen.getByTestId('card-especie-caranguejo-maria-farinha').dataset.ativo).toBe('true')

      const palco = screen.getByTestId('carrossel-Crustáceo-palco')
      fireEvent.mouseEnter(palco)
      act(() => {
        vi.advanceTimersByTime(9000)
      })
      expect(screen.getByTestId('card-especie-caranguejo-maria-farinha').dataset.ativo).toBe('true')

      fireEvent.mouseLeave(palco)
      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(screen.getByTestId('card-especie-guaiamum').dataset.ativo).toBe('true')
    } finally {
      vi.useRealTimers()
    }
  })

  it('pausa no foco e limpa o intervalo no unmount (sem leaks)', () => {
    vi.useFakeTimers()
    try {
      const { unmount } = render(
        <CarrosselEspecie
          testid="carrossel-Crustáceo"
          titulo="Crustáceos"
          itens={ESPECIES['Crustáceo']}
          onAbrir={() => {}}
        />,
      )
      fireEvent.focusIn(screen.getByLabelText('Próximas em Crustáceos'))
      act(() => {
        vi.advanceTimersByTime(6000)
      })
      expect(screen.getByTestId('card-especie-caranguejo-uca').dataset.ativo).toBe('true')
      expect(vi.getTimerCount()).toBe(0)

      fireEvent.focusOut(screen.getByLabelText('Próximas em Crustáceos'))
      expect(vi.getTimerCount()).toBe(1)

      unmount()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
