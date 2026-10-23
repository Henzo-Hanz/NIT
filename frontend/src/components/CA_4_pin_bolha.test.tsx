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

describe('CA-4: pin de Parnaíba abre bolha com a contagem', () => {
  it('clique no pin abre bolha pequena com a mensagem e o botão Ver espécies', async () => {    const usuario = userEvent.setup()
    configurarFetch({ '/api/geometrias/': FEATURE_COLLECTION })
    const { rerender } = render(<MapView />)
    await vi.waitFor(() => {
      expect(instancia().addSource).toHaveBeenCalled()
    })
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="pin-parnaiba"]')).not.toBeNull()
    })
    const pin = document.querySelector('[data-testid="pin-parnaiba"]') as HTMLElement
    await usuario.click(pin)
    expect(screen.getByTestId('bolha-parnaiba')).toHaveTextContent(
      '223 espécies de caranguejos encontradas',
    )
    expect(screen.getByTestId('ver-especies')).toBeInTheDocument()

    rerender(<MapView modalAberto />)
    expect(screen.queryByTestId('bolha-parnaiba')).toBeNull()
  })

  it('botão fechar bolha e a tecla Esc fecham a bolha', async () => {
    const usuario = userEvent.setup()
    configurarFetch({ '/api/geometrias/': FEATURE_COLLECTION })
    render(<MapView />)
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="pin-parnaiba"]')).not.toBeNull()
    })
    const pin = document.querySelector('[data-testid="pin-parnaiba"]') as HTMLElement
    await usuario.click(pin)
    expect(screen.getByTestId('bolha-parnaiba')).toBeInTheDocument()
    await usuario.click(screen.getByTestId('fechar-bolha'))
    expect(screen.queryByTestId('bolha-parnaiba')).toBeNull()
    await usuario.click(pin)
    expect(screen.getByTestId('bolha-parnaiba')).toBeInTheDocument()
    await usuario.keyboard('{Escape}')
    expect(screen.queryByTestId('bolha-parnaiba')).toBeNull()
  })

  it('seta de voltar na listagem retorna para a contagem', async () => {
    const usuario = userEvent.setup()
    configurarFetch({
      '/api/geometrias/': FEATURE_COLLECTION,
      '/api/especies/': [
        { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá' },
        { slug: 'caranguejo-maria-farinha', nome_popular: 'Maria-farinha' },
      ],
    })
    render(<MapView />)
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="pin-parnaiba"]')).not.toBeNull()
    })
    const pin = document.querySelector('[data-testid="pin-parnaiba"]') as HTMLElement
    await usuario.click(pin)
    await usuario.click(screen.getByTestId('ver-especies'))
    await screen.findByTestId('lista-especies-bolha')
    await usuario.click(screen.getByTestId('bolha-voltar'))
    expect(screen.getByTestId('ver-especies')).toBeInTheDocument()
    expect(screen.queryByTestId('lista-especies-bolha')).toBeNull()
  })

  it('pin usa a silhueta PhyloPic e cai no crab desenhado quando a imagem falha', async () => {
    configurarFetch({ '/api/geometrias/': FEATURE_COLLECTION })
    render(<MapView />)
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="pin-parnaiba"]')).not.toBeNull()
    })
    const pin = document.querySelector('[data-testid="pin-parnaiba"]') as HTMLElement
    const icone = pin.querySelector('image[data-icono-phylopic]')
    expect(icone?.getAttribute('href')).toBe('/api/especies/caranguejo-uca/icone/')
    const partesFallback = Array.from(
      pin.querySelectorAll('[data-fallback-crab], [data-fallback-crab-patas], [data-fallback-crab-olho]'),
    )
    expect(partesFallback.length).toBeGreaterThan(0)
    for (const parte of partesFallback) {
      expect((parte as HTMLElement).hasAttribute('style')).toBe(true)
    }
    icone?.dispatchEvent(new Event('error'))
    expect(pin.querySelector('image[data-icono-phylopic]')).toBeNull()
    for (const parte of partesFallback) {
      expect((parte as HTMLElement).hasAttribute('style')).toBe(false)
    }
  })
})
