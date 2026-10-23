import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapView } from './MapView'

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

const FEATURE_COLLECTION = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 1,
        nome: 'Parnaíba',
        tipo: 'ponto',
        descricao: '223 espécies de caranguejos encontradas',
        especie_slug: null,
        total: 223,
      },
      geometry: { type: 'Point', coordinates: [-41.7767, -2.9035] },
    },
  ],
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

const instancia = () => estadoMapa.instancias[estadoMapa.instancias.length - 1]

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-5: bolha mostra as 3 espécies e cada opção abre o modal', () => {
  it('Ver espécies lista as três e o clique do uçá chama onAbrirEspecie', async () => {
    const usuario = userEvent.setup()
    const aoAbrir = vi.fn()
    const fetchFake = configurarFetch({
      '/api/geometrias/': FEATURE_COLLECTION,
      '/api/especies/': ESPECIES,
    })
    render(<MapView onAbrirEspecie={aoAbrir} />)
    await vi.waitFor(() => {
      expect(instancia().addSource).toHaveBeenCalled()
    })
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="pin-parnaiba"]')).not.toBeNull()
    })
    await usuario.click(document.querySelector('[data-testid="pin-parnaiba"]') as HTMLElement)
    await usuario.click(screen.getByTestId('ver-especies'))
    await vi.waitFor(() => {
      expect(fetchFake).toHaveBeenCalledWith('/api/especies/')
    })
    expect(screen.getByTestId('lista-especies-bolha')).toBeInTheDocument()
    expect(screen.getByTestId('especie-opcao-caranguejo-uca')).toHaveTextContent('Caranguejo-uçá')
    expect(screen.getByTestId('especie-opcao-caranguejo-maria-farinha')).toHaveTextContent(
      'Caranguejo maria-farinha',
    )
    expect(screen.getByTestId('especie-opcao-caranguejeiro-laranja-do-norte')).toHaveTextContent(
      'Caranguejeiro-laranja-do-norte',
    )
    await usuario.click(screen.getByTestId('especie-opcao-caranguejo-uca'))
    expect(aoAbrir).toHaveBeenCalledWith('caranguejo-uca')
    expect(screen.queryByTestId('bolha-parnaiba')).toBeNull()
  })
})
