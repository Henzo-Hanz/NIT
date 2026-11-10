import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapView } from './MapView'
import { anelDaElipse } from '@/utils/geo'

const estadoMapa = vi.hoisted(() => ({
  instancias: [] as any[],
  disparoImediato: true,
  fonte: null as { setData: ReturnType<typeof vi.fn> } | null,
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
    getSource = vi.fn(() => estadoMapa.fonte)
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
  estadoMapa.fonte = null
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// Lapidação 11, ITEM B1: o arrasto do "círculo" deve produzir uma ELIPSE com
// rx e ry INDEPENDENTES desde o gesto de desenho — rx = |dx| e ry = |dy| de
// tela, qualquer direção (abs), piso ~3px por eixo na criação.
describe('CA-5: elipse desenhada desde a base (rx≠ry, qualquer direção)', () => {
  it('drag diagonal cria a elipse com rx e ry do gesto (não raio do hipotenusa)', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await usuario.click(screen.getByTestId('desenho-circulo'))

    const container = screen.getByTestId('mapa-container')
    // Preview durante o gesto: rx=|dx|, ry=|dy| do próprio arrasto.
    fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 30, clientY: 20 })
    const elipse = document
      .querySelector('[data-testid="preview-desenho"]')
      ?.querySelector('ellipse')
    expect(elipse?.getAttribute('rx')).toBe('20')
    expect(elipse?.getAttribute('ry')).toBe('10')

    fireEvent.mouseUp(container)
    await vi.waitFor(() => {
      expect(container.getAttribute('data-poligono-desenhado')).not.toBeNull()
    })
    // Criação: mesma elipse do gesto (dx=20, dy=10), centro na origem.
    expect(
      JSON.parse(container.getAttribute('data-poligono-desenhado') as string).coordinates[0],
    ).toEqual(anelDaElipse([10, 10], 20, 10))
  })

  it('qualquer direção: drag para cima à esquerda produz rx/ry absolutos', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await usuario.click(screen.getByTestId('desenho-circulo'))

    const container = screen.getByTestId('mapa-container')
    fireEvent.mouseDown(container, { clientX: 30, clientY: 30 })
    fireEvent.mouseMove(container, { clientX: 10, clientY: 25 })
    fireEvent.mouseUp(container)

    await vi.waitFor(() => {
      expect(container.getAttribute('data-poligono-desenhado')).not.toBeNull()
    })
    // dx=-20, dy=-5 → |rx|=20, |ry|=5; centro na origem do arrasto (30,30).
    expect(
      JSON.parse(container.getAttribute('data-poligono-desenhado') as string).coordinates[0],
    ).toEqual(anelDaElipse([30, 30], 20, 5))
  })

  it('piso ~3px por raio: drag só na horizontal gera ry mínimo', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await usuario.click(screen.getByTestId('desenho-circulo'))

    const container = screen.getByTestId('mapa-container')
    fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 25, clientY: 10 })
    fireEvent.mouseUp(container)

    await vi.waitFor(() => {
      expect(container.getAttribute('data-poligono-desenhado')).not.toBeNull()
    })
    const anel = JSON.parse(
      container.getAttribute('data-poligono-desenhado') as string,
    ).coordinates[0] as number[][]
    // dy=0 → ry trava no piso (~3px = 3 graus no fake de projeção).
    expect(anel).toEqual(anelDaElipse([10, 10], 15, 3))
  })
})
