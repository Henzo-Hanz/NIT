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
      x: coordenadas[0] * 2,
      y: coordenadas[1] * 2,
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

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-7: medir com cliques livres no mapa (sem área)', () => {
  it('clique livre marca A, o segundo marca B com linha + km e o terceiro reinicia', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })

    await usuario.click(screen.getByTestId('ferramenta-medir'))
    expect(screen.getByTestId('ferramenta-medir')).toHaveAttribute('aria-pressed', 'true')

    const container = screen.getByTestId('mapa-container')
    fireEvent.click(container, { clientX: 100, clientY: 120 })
    expect(screen.queryByTestId('linha-medida')).toBeNull()

    fireEvent.click(container, { clientX: 200, clientY: 160 })
    const linha = screen.getByTestId('linha-medida')
    expect(linha).toBeInTheDocument()
    expect(linha.getAttribute('stroke-dasharray')).toBeTruthy()
    expect(linha.getAttribute('x1')).toBe('200')
    expect(linha.getAttribute('y1')).toBe('240')
    expect(linha.getAttribute('x2')).toBe('400')
    expect(linha.getAttribute('y2')).toBe('320')

    const distancia = screen.getByTestId('distancia-medida')
    expect(distancia).toHaveTextContent(/km/)

    fireEvent.click(container, { clientX: 300, clientY: 100 })
    expect(screen.queryByTestId('linha-medida')).toBeNull()
    expect(screen.queryByTestId('distancia-medida')).toBeNull()

    fireEvent.click(container, { clientX: 20, clientY: 30 })
    const novaLinha = screen.getByTestId('linha-medida')
    expect(novaLinha).toBeInTheDocument()
    expect(novaLinha.getAttribute('x1')).toBe('600')

    fireEvent.click(container, { clientX: 220, clientY: 30 })
    expect(screen.queryByTestId('linha-medida')).toBeNull()
  })

  it('cliques em pontos ainda encaixam na medição livre', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })

    await usuario.click(screen.getByTestId('ferramenta-medir'))
    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    expect(screen.getAllByTestId('ponto-area')[0]).toHaveAttribute('data-medida', 'a')
    expect(screen.queryByTestId('linha-medida')).toBeNull()

    fireEvent.click(screen.getByTestId('mapa-container'), { clientX: 200, clientY: 160 })
    expect(screen.getByTestId('linha-medida')).toBeInTheDocument()
    expect(screen.getByTestId('distancia-medida')).toHaveTextContent(/km/)
  })

  it('a tecla ESC limpa a medição livre', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })

    await usuario.click(screen.getByTestId('ferramenta-medir'))
    const container = screen.getByTestId('mapa-container')
    fireEvent.click(container, { clientX: 100, clientY: 120 })
    fireEvent.click(container, { clientX: 200, clientY: 160 })
    expect(screen.getByTestId('linha-medida')).toBeInTheDocument()

    await usuario.keyboard('{Escape}')
    expect(screen.queryByTestId('linha-medida')).toBeNull()
    expect(screen.queryByTestId('distancia-medida')).toBeNull()
  })
})
