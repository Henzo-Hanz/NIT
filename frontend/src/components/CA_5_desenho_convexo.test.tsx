import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapView } from './MapView'
import { convexHull } from '../utils/geo'

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

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-5: convexHull descarta colineares e resolve traço cruzado', () => {
  it('pontos colineares não formam hull', () => {
    expect(
      convexHull([
        [10, 10],
        [20, 20],
        [30, 30],
      ]),
    ).toEqual([])
  })

  it('um traço em bowtie resulta nos quatro cantos convexos', () => {
    const hull = convexHull([
      [10, 10],
      [30, 30],
      [30, 10],
      [10, 30],
    ])
    expect(hull).toEqual([
      [10, 10],
      [30, 10],
      [30, 30],
      [10, 30],
    ])
  })
})

describe('CA-5: desenho livre aplica o hull antes de fechar o anel', () => {
  it('o preview e o polígono usam os cantos convexos, sem auto-interseção', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 30, clientY: 30 })
    fireEvent.mouseMove(container, { clientX: 30, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 10, clientY: 30 })

    const preview = screen.getByTestId('preview-desenho')
    expect(preview.querySelector('polyline')?.getAttribute('points')).toBe(
      '10,10 30,10 30,30 10,30',
    )

    fireEvent.mouseUp(container)

    await vi.waitFor(() => {
      expect(container.getAttribute('data-poligono-desenhado')).not.toBeNull()
    })
    const poligono = JSON.parse(container.getAttribute('data-poligono-desenhado') as string)
    expect(poligono.coordinates[0]).toEqual([
      [10, 10],
      [30, 10],
      [30, 30],
      [10, 30],
      [10, 10],
    ])
    expect(screen.getByTestId('area-tamanho-1')).toHaveTextContent('km²')
  })
})
