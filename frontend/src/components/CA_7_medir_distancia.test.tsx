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
    project = vi.fn((coordenadas: [number, number]) => ({
      x: 200 + coordenadas[0] * 10,
      y: 200 + coordenadas[1] * 10,
    }))
    unproject = vi.fn(([x, y]: [number, number]) => [x, y])
    getSource = vi.fn(() => ({ setData: vi.fn() }))
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

async function desenharArea(container: HTMLElement) {
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

describe('CA-7: medir distância entre pontos com linha pontilhada', () => {
  it('com dois pontos, marca A, desenha a linha e mostra a distância em km', async () => {
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
    expect(screen.getByTestId('ferramenta-medir')).toHaveAttribute('aria-pressed', 'true')

    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    expect(screen.getAllByTestId('ponto-area')[0]).toHaveAttribute('data-medida', 'a')
    expect(screen.queryByTestId('linha-medida')).toBeNull()

    await usuario.click(screen.getAllByTestId('ponto-area')[1])

    const linha = screen.getByTestId('linha-medida')
    expect(linha).toBeInTheDocument()
    expect(linha.getAttribute('stroke-dasharray')).toBeTruthy()

    const distancia = screen.getByTestId('distancia-medida')
    expect(distancia).toHaveTextContent(/km/)
    expect(distancia).toHaveTextContent(/38[,.]1\s*km/)
  })

  it('a tecla ESC limpa a medição e um terceiro clique começa outra', async () => {
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

    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    await usuario.click(screen.getAllByTestId('ponto-area')[1])
    expect(screen.getByTestId('linha-medida')).toBeInTheDocument()

    await usuario.keyboard('{Escape}')
    expect(screen.queryByTestId('linha-medida')).toBeNull()
    expect(screen.queryByTestId('distancia-medida')).toBeNull()

    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    await usuario.click(screen.getAllByTestId('ponto-area')[1])
    expect(screen.getByTestId('linha-medida')).toBeInTheDocument()
  })
})
