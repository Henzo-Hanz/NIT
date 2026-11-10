import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

function configurarFetch() {
  const fetchFake = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

async function desenhar(container: HTMLElement, deslocamento = 0) {
  fireEvent.mouseDown(container, { clientX: 10 + deslocamento, clientY: 10 + deslocamento })
  fireEvent.mouseMove(container, { clientX: 30 + deslocamento, clientY: 10 + deslocamento })
  fireEvent.mouseMove(container, { clientX: 20 + deslocamento, clientY: 20 + deslocamento })
  fireEvent.mouseUp(container)
}

const poligonoExibido = (container: HTMLElement) =>
  JSON.parse(container.getAttribute('data-poligono-desenhado') as string)

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-3: undo/redo das operações de área', () => {
  it('Ctrl+Z desfaz a criação e Ctrl+Y refaz', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    await desenhar(container)
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await vi.waitFor(() => {
      expect(screen.queryByTestId('area-item-1')).toBeNull()
    })

    fireEvent.keyDown(document, { key: 'y', ctrlKey: true })
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
  })

  it('apagar com Ctrl+Z restaura id, nome e polígono', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    await desenhar(container)
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    const original = poligonoExibido(container)

    await usuario.click(screen.getByTestId('apagar-area-1'))
    await vi.waitFor(() => {
      expect(screen.queryByTestId('area-item-1')).toBeNull()
    })

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    expect(screen.getByTestId('area-item-1')).toHaveTextContent('Área 1')
    expect(poligonoExibido(container)).toEqual(original)
  })

  it('Ctrl+Z desfaz o colar e Ctrl+Y refaz', async () => {
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

    fireEvent.keyDown(document, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(document, { key: 'v', ctrlKey: true })
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-2')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await vi.waitFor(() => {
      expect(screen.queryByTestId('area-item-2')).toBeNull()
    })
    expect(screen.getAllByTestId(/^area-item-/)).toHaveLength(1)

    fireEvent.keyDown(document, { key: 'y', ctrlKey: true })
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-2')).toBeInTheDocument()
    })
  })

  it('acima de 50 estados o snapshot mais antigo é descartado', async () => {
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
    fireEvent.keyDown(document, { key: 'c', ctrlKey: true })

    // 55 colagens -> 56 áreas; 50 snapshots no máximo. O lote dentro de um
    // único `act` evita 105 renders intermediários (o ref de áreas é síncrono).
    act(() => {
      for (let indice = 0; indice < 55; indice += 1) {
        fireEvent.keyDown(document, { key: 'v', ctrlKey: true })
      }
    })
    await vi.waitFor(() => {
      expect(screen.getAllByTestId(/^area-item-/)).toHaveLength(56)
    })

    act(() => {
      for (let indice = 0; indice < 50; indice += 1) {
        fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
      }
    })
    await vi.waitFor(() => {
      expect(screen.getAllByTestId(/^area-item-/)).toHaveLength(6)
    })

    // 51º undo não tem mais histórico: mantém as 6 áreas restantes.
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    expect(screen.getAllByTestId(/^area-item-/)).toHaveLength(6)
  }, 20000)
})
