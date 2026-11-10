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

async function desenhar(container: HTMLElement) {
  fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
  fireEvent.mouseMove(container, { clientX: 30, clientY: 10 })
  fireEvent.mouseMove(container, { clientX: 20, clientY: 20 })
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

describe('CA-1: Ctrl+C copia a área ativa e Ctrl+V cola uma cópia deslocada', () => {
  it('cola nova área com id/nome novos, +0.01° em lon/lat e já selecionada', async () => {
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

    await usuario.click(screen.getByTestId('selecionar-area-1'))
    expect(screen.getByTestId('selecionar-area-1')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.keyDown(document, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(document, { key: 'v', ctrlKey: true })

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-2')).toBeInTheDocument()
    })
    expect(screen.getByTestId('selecionar-area-2')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('area-item-2')).toHaveTextContent('Área 2')

    const colada = poligonoExibido(container)
    const anelOriginal = original.coordinates[0]
    const anelColado = colada.coordinates[0]
    expect(anelColado).toHaveLength(anelOriginal.length)
    anelColado.forEach((ponto: number[], indice: number) => {
      expect(ponto[0]).toBeCloseTo(anelOriginal[indice][0] + 0.01, 6)
      expect(ponto[1]).toBeCloseTo(anelOriginal[indice][1] + 0.01, 6)
    })
  })

  it('Ctrl+V sem cópia anterior não cria área', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    await desenhar(container)
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'v', ctrlKey: true })

    expect(screen.queryByTestId('area-item-2')).toBeNull()
    expect(screen.getAllByTestId(/^area-item-/)).toHaveLength(1)
  })
})
