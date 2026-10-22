import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MapView, CENTRO_LITORAL_PI, ZOOM_INICIAL } from './MapView'

const mapaCriado = vi.hoisted(() => ({ instancia: null as any }))

let opcoesCapturadas: { center?: number[]; zoom?: number } = {}

vi.mock('maplibre-gl', () => {
  class MapFake {
    opcoes: any
    on = vi.fn()
    remove = vi.fn()
    zoomIn = vi.fn()
    zoomOut = vi.fn()
    easeTo = vi.fn()
    constructor(opcoes: any) {
      this.opcoes = opcoes
      opcoesCapturadas = opcoes
      mapaCriado.instancia = this
    }
  }
  return { Map: MapFake }
})

beforeEach(() => {
  opcoesCapturadas = {}
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('CA-1: mapa full-screen com controles e centro no litoral do Piauí', () => {
  it('renderiza container, controles +/− e inicia no centro do litoral do PI', () => {
    render(<MapView />)
    expect(screen.getByTestId('mapa')).toBeInTheDocument()
    expect(screen.getByTestId('mapa-zoom-in')).toBeInTheDocument()
    expect(screen.getByTestId('mapa-zoom-out')).toBeInTheDocument()
    expect(opcoesCapturadas.center).toEqual(CENTRO_LITORAL_PI)
    expect(opcoesCapturadas.center[0]).toBeCloseTo(-41.75, 1)
    expect(opcoesCapturadas.center[1]).toBeCloseTo(-2.9, 1)
    expect(opcoesCapturadas.zoom).toBe(ZOOM_INICIAL)
    expect(opcoesCapturadas.zoom).toBeCloseTo(6, 5)
  })
})
