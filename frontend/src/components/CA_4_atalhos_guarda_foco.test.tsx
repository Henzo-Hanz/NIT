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

const PONTOS = [
  {
    type: 'Feature',
    properties: {
      id: 1,
      nome: 'Jericoacoara',
      descricao: '1 espécie encontrada',
      especie_slugs: ['caranguejo-uca'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [100, 60] },
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
    geometry: { type: 'Point', coordinates: [200, 80] },
  },
]

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    if (String(entrada) === '/api/consulta/area/') {
      return {
        ok: true,
        json: async () => ({
          especies: [{ slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 1 }],
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

describe('CA-4: atalhos respeitam foco, modal e preservam Escape', () => {
  it('com foco no campo de busca os atalhos não são interceptados', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    await desenhar(container)
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('selecionar-area-1'))

    await usuario.click(screen.getByTestId('ferramenta-pesquisar'))
    const campo = screen.getByTestId('campo-busca')
    campo.focus()

    const naoCancelado = fireEvent.keyDown(campo, { key: 'c', ctrlKey: true })
    expect(naoCancelado).toBe(true)
    fireEvent.keyDown(campo, { key: 'v', ctrlKey: true })
    fireEvent.keyDown(campo, { key: 'x', ctrlKey: true })

    expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    expect(screen.queryByTestId('area-item-2')).toBeNull()
  })

  it('com modal aberto os atalhos não alteram as áreas', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView modalAberto />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    await desenhar(container)
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('selecionar-area-1'))

    fireEvent.keyDown(document, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(document, { key: 'v', ctrlKey: true })
    fireEvent.keyDown(document, { key: 'x', ctrlKey: true })

    expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    expect(screen.queryByTestId('area-item-2')).toBeNull()
  })

  it('metaKey funciona como Ctrl (macOS)', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    await desenhar(container)
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('selecionar-area-1'))

    fireEvent.keyDown(document, { key: 'c', metaKey: true })
    fireEvent.keyDown(document, { key: 'v', metaKey: true })

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-2')).toBeInTheDocument()
    })
    expect(screen.getByTestId('selecionar-area-2')).toHaveAttribute('aria-pressed', 'true')
  })

  it('Escape de medir continua funcionando junto dos atalhos', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })

    await usuario.click(screen.getByTestId('ferramenta-medir'))
    const pontos = screen.getAllByTestId('ponto-area')
    await usuario.click(pontos[0])
    await usuario.click(pontos[1])
    expect(screen.getByTestId('linha-medida')).toBeInTheDocument()

    await usuario.keyboard('{Escape}')
    expect(screen.queryByTestId('linha-medida')).toBeNull()
    expect(screen.queryByTestId('distancia-medida')).toBeNull()
  })
})
