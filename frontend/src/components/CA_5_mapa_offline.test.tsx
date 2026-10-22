import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MapView } from './MapView'

const mapaCriado = vi.hoisted(() => ({
  instancia: null as any,
  disparaErro: undefined as (() => void) | undefined,
}))

vi.mock('maplibre-gl', () => {
  class MapFake {
    on = vi.fn((evento: string, handler: () => void) => {
      if (evento === 'error') {
        mapaCriado.disparaErro = handler
      }
    })
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
  mapaCriado.disparaErro = undefined
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('CA-5: basemap offline não quebra a UI', () => {
  it('exibe mensagem de erro mantendo o container', () => {
    render(<MapView />)
    expect(screen.getByTestId('mapa')).toBeInTheDocument()
    act(() => mapaCriado.disparaErro())
    expect(screen.getByTestId('mapa-erro')).toHaveTextContent('Mapa indisponível')
    expect(screen.getByTestId('mapa')).toBeInTheDocument()
  })
})
