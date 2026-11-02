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

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-5: desenho de quadrado e círculo', () => {
  it('arrastar define o lado do quadrado ancorado no ponto inicial', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await usuario.click(screen.getByTestId('desenho-quadrado'))

    const container = screen.getByTestId('mapa-container')
    fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 30, clientY: 25 })

    const preview = screen.getByTestId('preview-desenho')
    expect(preview).toHaveAttribute('data-forma', 'quadrado')
    const retangulo = preview.querySelector('rect')
    expect(retangulo).not.toBeNull()
    expect(retangulo?.getAttribute('x')).toBe('10')
    expect(retangulo?.getAttribute('y')).toBe('10')
    expect(retangulo?.getAttribute('width')).toBe('20')
    expect(retangulo?.getAttribute('height')).toBe('20')
    expect(preview.querySelector('polyline')).toBeNull()

    fireEvent.mouseUp(container)

    await vi.waitFor(() => {
      expect(container.getAttribute('data-poligono-desenhado')).not.toBeNull()
    })
    const poligono = JSON.parse(container.getAttribute('data-poligono-desenhado') as string)
    expect(poligono.type).toBe('Polygon')
    expect(poligono.coordinates[0]).toEqual([
      [10, 10],
      [30, 10],
      [30, 30],
      [10, 30],
      [10, 10],
    ])
    expect(screen.getByTestId('area-tamanho-1')).toHaveTextContent('km²')
  })

  it('arrastar do centro define o raio do círculo com 32 vértices', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await usuario.click(screen.getByTestId('desenho-circulo'))

    const container = screen.getByTestId('mapa-container')
    fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 20, clientY: 10 })

    const preview = screen.getByTestId('preview-desenho')
    expect(preview).toHaveAttribute('data-forma', 'circulo')
    const elipse = preview.querySelector('ellipse')
    expect(elipse).not.toBeNull()
    expect(elipse?.getAttribute('cx')).toBe('10')
    expect(elipse?.getAttribute('cy')).toBe('10')
    expect(elipse?.getAttribute('rx')).toBe('10')
    expect(elipse?.getAttribute('ry')).toBe('10')
    expect(preview.querySelector('polyline')).toBeNull()

    fireEvent.mouseUp(container)

    await vi.waitFor(() => {
      expect(container.getAttribute('data-poligono-desenhado')).not.toBeNull()
    })
    const poligono = JSON.parse(container.getAttribute('data-poligono-desenhado') as string)
    const anel = poligono.coordinates[0] as number[][]
    expect(anel).toHaveLength(33)
    expect(anel[0]).toEqual(anel[anel.length - 1])
    expect(screen.getByTestId('area-tamanho-1')).toHaveTextContent('km²')
  })
})
