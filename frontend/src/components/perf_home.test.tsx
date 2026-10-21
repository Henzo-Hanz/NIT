import { render, screen } from '@testing-library/react'
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
    constructor() {
      mapaCriado.instancia = this
    }
  }
  return { Map: MapFake }
})

beforeEach(() => {
  mapaCriado.instancia = null
})
afterEach(() => {
  vi.clearAllMocks()
})

const RESPOSTA_MAX_S = 60

describe('desempenho: montagem do shell com mapa', () => {
  it('monta MapView dentro do teto resposta_max_s=60', () => {
    const inicio = performance.now()
    render(<MapView />)
    const duracao = (performance.now() - inicio) / 1000
    expect(screen.getByTestId('mapa')).toBeInTheDocument()
    expect(duracao).toBeLessThan(RESPOSTA_MAX_S)
  })
})
