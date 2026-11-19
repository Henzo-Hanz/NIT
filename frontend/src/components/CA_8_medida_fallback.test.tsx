import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    fonte = { setData: vi.fn(), setTiles: vi.fn() }
    zoomIn = vi.fn()
    zoomOut = vi.fn()
    easeTo = vi.fn()
    addSource = vi.fn()
    addLayer = vi.fn()
    setLayoutProperty = vi.fn()
    project = vi.fn((coordenadas: [number, number]) => ({
      x: 200 + coordenadas[0] * 10,
      y: 200 + coordenadas[1] * 10,
    }))
    unproject = vi.fn(([x, y]: [number, number]) => [x, y])
    getSource = vi.fn(() => this.fonte)
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
    geometry: { type: 'Point', coordinates: [-40.513, -2.797] },
  },
  {
    type: 'Feature',
    properties: {
      id: 2,
      nome: 'Camocim',
      descricao: '1 espécie encontrada',
      especie_slugs: ['caranguejo-uca'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [-40.84, -2.9] },
  },
]

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    const url = String(entrada)
    if (url === '/api/consulta/area/') {
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

async function desenharArea(container: HTMLElement) {
  fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
  fireEvent.mouseMove(container, { clientX: 30, clientY: 10 })
  fireEvent.mouseMove(container, { clientX: 20, clientY: 20 })
  fireEvent.mouseUp(container)
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-8: rota indisponível cai para a distância absoluta com aviso', () => {
  it('com /api/rota/ falhando, mostra aviso-rota e mantém a linha tracejada com km', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await desenharArea(screen.getByTestId('mapa-container'))
    await usuario.click(screen.getByTestId('desenho-voltar'))

    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })

    await usuario.click(screen.getByTestId('ferramenta-medir'))
    await usuario.click(screen.getByTestId('medida-rota'))

    const pontos = screen.getAllByTestId('ponto-area')
    await usuario.click(pontos[0])
    await usuario.click(pontos[1])

    await vi.waitFor(() => {
      expect(screen.getByTestId('aviso-rota')).toBeInTheDocument()
    })
    expect(screen.getByTestId('aviso-rota')).toHaveTextContent(/Rota indisponível/)
    expect(screen.queryByTestId('overlay-rota')).toBeNull()
    expect(screen.getByTestId('linha-medida')).toBeInTheDocument()
    expect(screen.getByTestId('distancia-medida')).toHaveTextContent(/km/)
  })
})
