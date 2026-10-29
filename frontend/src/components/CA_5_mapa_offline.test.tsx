import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MapView } from './MapView'

const mapas = vi.hoisted(() => ({
  instancias: [] as any[],
}))

vi.mock('maplibre-gl', () => {
  class MapFake {
    opcoes: any
    manejarErro?: () => void
    remove = vi.fn()
    zoomIn = vi.fn()
    zoomOut = vi.fn()
    easeTo = vi.fn()
    constructor(opcoes: any) {
      this.opcoes = opcoes
      mapas.instancias.push(this)
    }
    on = vi.fn((evento: string, handler: () => void) => {
      if (evento === 'error') {
        this.manejarErro = handler
      }
    })
  }
  return { Map: MapFake }
})

beforeEach(() => {
  vi.stubEnv('VITE_CARTO_API_KEY', 'chave-de-teste')
  mapas.instancias.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('CA-5: basemap offline não quebra a UI', () => {
  it('erro com key recria o basemap anônimo uma vez; erro de novo mostra mensagem amigável', () => {
    render(<MapView />)
    expect(mapas.instancias).toHaveLength(1)
    act(() => mapas.instancias[0].manejarErro())
    expect(mapas.instancias).toHaveLength(2)
    const tilesSemKey = mapas.instancias[1].opcoes.style.sources.basemap.tiles as string[]
    expect(tilesSemKey.every((tile) => !tile.includes('?key='))).toBe(true)
    expect(screen.queryByTestId('mapa-erro')).toBeNull()
    act(() => mapas.instancias[1].manejarErro())
    expect(screen.getByTestId('mapa-erro')).toHaveTextContent('Mapa indisponível')
    expect(screen.getByTestId('mapa')).toBeInTheDocument()
  })
})
