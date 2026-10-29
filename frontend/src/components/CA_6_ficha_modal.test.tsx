import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EspecieModal } from './EspecieModal'

const FICHA_UCA = {
  slug: 'caranguejo-uca',
  nome_popular: 'Caranguejo-uçá',
  nome_cientifico: 'Ucides cordatus',
  descricao: 'MORADOR DO MANQUEZAL — parágrafo mockado da ficha.',
  infos: { tamanho_max_cm: 9, habitat: 'Manguezal' },
  imagem: 'biodiversidade/midia/caranguejo-uca.svg',
}

function configurarFetch(rotas: Record<string, unknown>) {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    const rota = String(entrada)
    if (rotas[rota]) {
      return { ok: true, json: async () => rotas[rota] }
    }
    return { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-6: ficha da espécie em modal centralizado', () => {
  it('mostra foto centralizada, nome, científico, parágrafo e infos', async () => {
    configurarFetch({ '/api/especies/caranguejo-uca/': FICHA_UCA })
    render(<EspecieModal slug="caranguejo-uca" onFechar={vi.fn()} />)
    expect(await screen.findByTestId('modal-especie')).toBeInTheDocument()
    expect(await screen.findByTestId('foto-especie')).toHaveAttribute(
      'src',
      '/api/especies/caranguejo-uca/imagem/',
    )
    expect(screen.getByTestId('nome-popular-modal')).toHaveTextContent('Caranguejo-uçá')
    expect(screen.getByTestId('nome-cientifico')).toHaveTextContent('Ucides cordatus')
    expect(screen.getByTestId('descricao-especie')).toHaveTextContent(
      'parágrafo mockado da ficha',
    )
    expect(screen.getAllByTestId('info-especie')).toHaveLength(2)
  })

  it('tecla Esc fecha o modal chamando onFechar', async () => {
    const aoFechar = vi.fn()
    configurarFetch({ '/api/especies/caranguejo-uca/': FICHA_UCA })
    render(<EspecieModal slug="caranguejo-uca" onFechar={aoFechar} />)
    await screen.findByTestId('foto-especie')
    const usuario = userEvent.setup()
    await usuario.keyboard('{Escape}')
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('botão fechar chama onFechar; slug inexistente mostra indisponível', async () => {
    const aoFechar = vi.fn()
    configurarFetch({ '/api/especies/caranguejo-uca/': FICHA_UCA })
    const { rerender } = render(<EspecieModal slug="slug-errado" onFechar={aoFechar} />)
    await vi.waitFor(() => {
      expect(screen.getByTestId('modal-indisponivel')).toBeInTheDocument()
    })
    rerender(<EspecieModal slug="caranguejo-uca" onFechar={aoFechar} />)
    await screen.findByTestId('foto-especie')
    const usuario = userEvent.setup()
    await usuario.click(screen.getByTestId('fechar-especie'))
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('seta no topo esquerdo volta para a lista quando fornecida', async () => {
    const aoVoltarLista = vi.fn()
    configurarFetch({ '/api/especies/caranguejo-uca/': FICHA_UCA })
    const { rerender } = render(<EspecieModal slug="caranguejo-uca" onFechar={vi.fn()} />)
    await screen.findByTestId('foto-especie')
    expect(screen.queryByTestId('voltar-lista')).toBeNull()
    rerender(
      <EspecieModal slug="caranguejo-uca" onFechar={vi.fn()} onVoltarLista={aoVoltarLista} />,
    )
    const usuario = userEvent.setup()
    await usuario.click(screen.getByTestId('voltar-lista'))
    expect(aoVoltarLista).toHaveBeenCalledTimes(1)
  })
})
