import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    project = vi.fn((coordenadas: [number, number]) => ({ x: coordenadas[0], y: coordenadas[1] }))
    unproject = vi.fn(([x, y]: [number, number]) => [x, y])
    getSource = vi.fn().mockImplementation(() => null)
    dragPan = { enable: vi.fn(), disable: vi.fn() }
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

const ESPECIES_AREA = [
  { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 2 },
  { slug: 'guaiamum', nome_popular: 'Guaiamum', contagem: 1 },
]

const PONTOS = [
  {
    type: 'Feature',
    properties: {
      id: 1,
      nome: 'Jericoacoara',
      descricao: '2 espécies encontradas',
      especie_slugs: ['caranguejo-uca', 'guaiamum'],
      total: 2,
    },
    geometry: { type: 'Point', coordinates: [24, 14] },
  },
]

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    if (String(entrada) === '/api/consulta/area/') {
      return {
        ok: true,
        json: async () => ({
          especies: ESPECIES_AREA,
          pontos: { type: 'FeatureCollection', features: PONTOS },
        }),
      }
    }
    return { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

async function desenhar(container: HTMLElement) {
  fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
  fireEvent.mouseMove(container, { clientX: 30, clientY: 10 })
  fireEvent.mouseMove(container, { clientX: 20, clientY: 20 })
  fireEvent.mouseUp(container)
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// CA-6 (lapidação 4, item 9): Filtros e Áreas minimizam com o botão da
// coroa/header — minimizar NÃO reinicia o estado interno.
describe('CA-6: painéis minimizáveis sem perda de estado', () => {
  it('o painel de filtros minimiza e ao reabrir mantém filtro Automaticamente', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    const corpo = screen.getByTestId('corpo-filtros')
    expect(corpo).toHaveAttribute('data-aberto', 'true')

    await usuario.click(screen.getByTestId('filtro-mais'))
    expect(screen.getByTestId('filtro-mais')).toHaveAttribute('data-ativo', 'true')

    const recolher = screen.getByTestId('recolher-filtros')
    await usuario.click(recolher)
    expect(corpo).toHaveAttribute('data-aberto', 'false')
    expect(recolher).toHaveAttribute('aria-expanded', 'false')

    await usuario.click(recolher)
    expect(corpo).toHaveAttribute('data-aberto', 'true')
    expect(screen.getByTestId('filtro-mais')).toHaveAttribute('data-ativo', 'true')
    // O estado do filtro não perdeu a força: o chip continua aplicado.
    expect(screen.getByTestId('filtro-aplicado')).toHaveTextContent('Filtrando por: Mais presente')
  })

  it('o painel de áreas minimiza e ao reabrir as áreas seguem desenhadas', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await desenhar(screen.getByTestId('mapa-container'))

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })

    const corpo = screen.getByTestId('corpo-areas')
    expect(corpo).toHaveAttribute('data-aberto', 'true')

    const recolher = screen.getByTestId('recolher-areas')
    await usuario.click(recolher)
    expect(corpo).toHaveAttribute('data-aberto', 'false')
    expect(recolher).toHaveAttribute('aria-expanded', 'false')

    await usuario.click(recolher)
    expect(corpo).toHaveAttribute('data-aberto', 'true')
    expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    expect(screen.queryByTestId('areas-vazia')).toBeNull()
  })
})
