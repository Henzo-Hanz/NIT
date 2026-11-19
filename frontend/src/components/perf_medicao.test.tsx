import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MapView } from './MapView'

const mapaCriado = vi.hoisted(() => ({ instancia: null as any }))

vi.mock('maplibre-gl', () => {
  class MapFake {
    on = vi.fn()
    remove = vi.fn()
    zoomIn = vi.fn()
    zoomOut = vi.fn()
    easeTo = vi.fn()
    addSource = vi.fn()
    addLayer = vi.fn()
    setLayoutProperty = vi.fn()
    project = vi.fn((coordenadas: [number, number]) => ({ x: coordenadas[0], y: coordenadas[1] }))
    unproject = vi.fn(([x, y]: [number, number]) => [x, y])
    getSource = vi.fn(() => ({ setData: vi.fn(), setTiles: vi.fn() }))
    dragPan = { enable: vi.fn(), disable: vi.fn() }
    constructor() {
      mapaCriado.instancia = this
    }
  }
  return { Map: MapFake }
})

function configurarFetch() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
}

beforeEach(() => {
  mapaCriado.instancia = null
  configurarFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const RESPOSTA_MAX_S = 60

describe('desempenho: interação com o medidor de distância', () => {
  it('abre o medidor dentro do teto resposta_max_s=60', () => {
    const inicio = performance.now()
    render(<MapView />)
    fireEvent.click(screen.getByTestId('ferramenta-medir'))
    fireEvent.click(screen.getByTestId('medida-absoluta'))
    const duracao = (performance.now() - inicio) / 1000
    expect(screen.getByTestId('ferramentas-medida')).toBeInTheDocument()
    expect(duracao).toBeLessThan(RESPOSTA_MAX_S)
  })
})
