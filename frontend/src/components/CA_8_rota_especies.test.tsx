import App from '../App'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const estadoMapa = vi.hoisted(() => ({
  instancias: [] as any[],
  disparoImediato: true,
}))

vi.mock('maplibre-gl', () => {
  class MapFake {
    opcoes: any
    registro: Map<string, (evento?: unknown) => void> = new Map()
    zoomIn = vi.fn()
    zoomOut = vi.fn()
    easeTo = vi.fn()
    addSource = vi.fn()
    addLayer = vi.fn()
    setLayoutProperty = vi.fn()
    project = vi.fn(() => ({ x: 120, y: 180 }))
    remove = vi.fn()
    on = (evento: string, cb: (evento?: unknown) => void) => {
      this.registro.set(evento, cb)
      return undefined
    }
    constructor(opcoes: any) {
      this.opcoes = opcoes
      estadoMapa.instancias.push(this)
      if (estadoMapa.disparoImediato) {
        queueMicrotask(() => this.registro.get('load')?.())
      }
    }
  }
  class MarkerFake {
    element: any
    setLngLat = vi.fn().mockReturnThis()
    remove = vi.fn()
    constructor(opcoes: { element?: HTMLElement }) {
      this.element = opcoes?.element
    }
    addTo = vi.fn(() => {
      if (this.element) {
        document.body.appendChild(this.element)
      }
      return this
    })
  }
  return { Map: MapFake, Marker: MarkerFake }
})

const ESPECIES = [
  {
    slug: 'caranguejo-uca',
    nome_popular: 'Caranguejo-uçá',
    nome_cientifico: 'Ucides cordatus',
    imagem: 'biodiversidade/midia/caranguejo-uca.svg',
  },
  {
    slug: 'caranguejo-maria-farinha',
    nome_popular: 'Caranguejo maria-farinha',
    nome_cientifico: 'Ocypode quadrata',
    imagem: 'biodiversidade/midia/caranguejo-maria-farinha.svg',
  },
  {
    slug: 'caranguejeiro-laranja-do-norte',
    nome_popular: 'Caranguejeiro-laranja-do-norte',
    nome_cientifico: null,
    imagem: 'biodiversidade/midia/caranguejeiro-laranja-do-norte.svg',
  },
]

const FICHA_UCA = {
  slug: 'caranguejo-uca',
  nome_popular: 'Caranguejo-uçá',
  nome_cientifico: 'Ucides cordatus',
  descricao: 'Parágrafo da ficha.',
  infos: { tamanho_max_cm: 9 },
  imagem: 'biodiversidade/midia/caranguejo-uca.svg',
}

function configurarFetch(rotas: (string | Record<string, unknown>)[]) {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    const rota = String(entrada)
    for (const item of rotas) {
      if (typeof item === 'string') {
        if (rota === item) {
          return { ok: false, json: async () => ({}) }
        }
      } else if (rota in item) {
        return { ok: true, json: async () => item[rota] }
      }
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

describe('CA-8: rota /especies com listagem que abre o modal', () => {
  it('o item Espécies navega, lista as 3 espécies em cards e abre a ficha', async () => {
    const usuario = userEvent.setup()
    configurarFetch([
      { '/api/ping/': { status: 'ok' } },
      { '/api/especies/': ESPECIES },
      { '/api/especies/caranguejo-uca/': FICHA_UCA },
    ])
    render(<App />)
    await usuario.click(screen.getByTestId('nav-espécies'))
    expect(await screen.findByTestId('especies-titulo')).toBeInTheDocument()
    expect(await screen.findByTestId('card-especie-caranguejo-uca')).toBeInTheDocument()
    expect(await screen.findByTestId('card-especie-caranguejo-maria-farinha')).toBeInTheDocument()
    expect(await screen.findByTestId('card-especie-caranguejeiro-laranja-do-norte')).toBeInTheDocument()
    await usuario.click(screen.getByTestId('card-especie-caranguejo-uca'))
    expect(await screen.findByTestId('modal-especie')).toBeInTheDocument()
    expect(await screen.findByTestId('foto-especie')).toHaveAttribute(
      'src',
      '/api/especies/caranguejo-uca/imagem/',
    )
    await usuario.click(screen.getByTestId('fechar-especie'))
    expect(screen.queryByTestId('modal-especie')).toBeNull()
    await usuario.click(screen.getByTestId('voltar-inicio'))
    expect(await screen.findByTestId('mapa')).toBeInTheDocument()
    expect(screen.queryByTestId('especies-titulo')).toBeNull()
  })
})
