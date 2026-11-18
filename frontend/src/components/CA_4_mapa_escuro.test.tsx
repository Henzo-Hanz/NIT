import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MapView } from './MapView'
import { aplicarTema } from '@/lib/tema'

const estadoMapa = vi.hoisted(() => ({
  instancias: [] as any[],
  disparoImediato: true,
}))

vi.mock('maplibre-gl', () => {
  class MapFake {
    opcoes: any
    registro: Map<string, (evento?: unknown) => void> = new Map()
    fonte = { setData: vi.fn(), setTiles: vi.fn() }
    zoomIn = vi.fn()
    zoomOut = vi.fn()
    easeTo = vi.fn()
    addSource = vi.fn()
    addLayer = vi.fn()
    setLayoutProperty = vi.fn()
    project = vi.fn((coordenadas: [number, number]) => ({
      x: coordenadas[0] * 10,
      y: coordenadas[1] * 10,
    }))
    unproject = vi.fn(([x, y]: [number, number]) => [x, y])
    getSource = vi.fn(() => this.fonte)
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

const instancia = () => estadoMapa.instancias[estadoMapa.instancias.length - 1]
const tilesIniciais = () => instancia().opcoes.style.sources.basemap.tiles as string[]

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('CA-4: basemap acompanha o tema salvo e troca os tiles ao vivo', () => {
  it('com tema escuro salvo, nasce com dark_all e alterna para voyager sem recriar o mapa', () => {
    configurarFetch()
    localStorage.setItem('nit-tema', 'escuro')

    render(<MapView />)

    expect(screen.getByTestId('mapa')).toBeInTheDocument()
    const tiles = tilesIniciais()
    expect(tiles).toHaveLength(3)
    expect(tiles.every((tile) => tile.includes('rastertiles/dark_all/'))).toBe(true)

    act(() => {
      aplicarTema('claro')
    })

    const mapa = instancia()
    expect(mapa.fonte.setTiles).toHaveBeenCalledTimes(1)
    const trocados = mapa.fonte.setTiles.mock.calls[0][0] as string[]
    expect(trocados.every((tile) => tile.includes('rastertiles/voyager/'))).toBe(true)
    expect(estadoMapa.instancias).toHaveLength(1)
  })
})
