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

const AREA_1: [number, number][] = [
  [-41.8, -2.9],
  [-41.7, -2.9],
  [-41.75, -3.0],
]

const AREA_2: [number, number][] = [
  [-42.0, -3.2],
  [-41.9, -3.2],
  [-41.95, -3.3],
]

async function desenhar(container: HTMLElement, pontos: [number, number][]) {
  fireEvent.mouseDown(container, { clientX: pontos[0][0], clientY: pontos[0][1] })
  for (const [x, y] of pontos.slice(1)) {
    fireEvent.mouseMove(container, { clientX: x, clientY: y })
  }
  fireEvent.mouseUp(container)
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-5: preview ao vivo do desenho e área com tamanho estimado', () => {
  it('mostra a polilinha do preview com os pontos coletados durante o desenho', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    fireEvent.mouseDown(container, { clientX: -41.8, clientY: -2.9 })
    fireEvent.mouseMove(container, { clientX: -41.7, clientY: -2.9 })
    fireEvent.mouseMove(container, { clientX: -41.75, clientY: -3.0 })

    const preview = screen.getByTestId('preview-desenho')
    const pontos = preview.querySelector('polyline')?.getAttribute('points') ?? ''
    expect(pontos).toContain('-41.8,-2.9')
    expect(pontos).toContain('-41.75,-3')

    fireEvent.mouseUp(container)
  })

  it('ao soltar a área ela aparece na lista com a estimativa em km²', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    await desenhar(screen.getByTestId('mapa-container'), AREA_1)

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    const tamanho = screen.getByTestId('area-tamanho-1')
    expect(tamanho).toHaveTextContent('km²')
    expect(tamanho).toHaveTextContent(/≈\s*[\d.,]+\s*km²/)
    const valor = Number(
      (tamanho.textContent ?? '').replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'),
    )
    expect(valor).toBeGreaterThan(0)
    expect(screen.getByTestId('area-tamanho')).toHaveTextContent('km²')
  })

  it('a segunda área adicionada não substitui a primeira', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    await desenhar(container, AREA_1)
    await desenhar(container, AREA_2)

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    expect(screen.getByTestId('area-item-2')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^area-item-/)).toHaveLength(2)
    expect(screen.getByTestId('area-tamanho-1')).toHaveTextContent('km²')
    expect(screen.getByTestId('area-tamanho-2')).toHaveTextContent('km²')
  })
})
