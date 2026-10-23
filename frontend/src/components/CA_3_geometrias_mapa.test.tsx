import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MapView } from './MapView'

const estadoMapa = vi.hoisted(() => ({
  instancias: [] as any[],
  disparoImediato: true,
}))

vi.mock('maplibre-gl', () => {
  class MapFake {
    opcoes: any
    registro: Map<string, (evento?: unknown) => void>
    zoomIn = vi.fn()
    zoomOut = vi.fn()
    easeTo = vi.fn()
    addSource = vi.fn()
    addLayer = vi.fn()
    setLayoutProperty = vi.fn()
    project = vi.fn(() => ({ x: 120, y: 180 }))
    remove = vi.fn()
    constructor(opcoes: any) {
      this.opcoes = opcoes
      this.registro = new Map()
      this.on = (evento: string, cb: (evento?: unknown) => void) => {
        this.registro.set(evento, cb)
        return undefined
      }
      estadoMapa.instancias.push(this)
      if (estadoMapa.disparoImediato) {
        queueMicrotask(() => this.registro.get('load')?.())
      }
    }
    on!: (evento: string, cb: (evento?: unknown) => void) => void
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

const FEATURE_COLLECTION = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 1,
        nome: 'Parnaíba',
        tipo: 'ponto',
        descricao: '223 espécies de caranguejos encontradas',
        especie_slug: null,
        total: 223,
      },
      geometry: { type: 'Point', coordinates: [-41.7767, -2.9035] },
    },
    {
      type: 'Feature',
      properties: { id: 2, nome: 'Linha de costa amostral', tipo: 'linha', descricao: '', especie_slug: null },
      geometry: { type: 'LineString', coordinates: [[-41.86, -2.87], [-41.82, -2.94]] },
    },
    {
      type: 'Feature',
      properties: { id: 3, nome: 'APA Delta do Parnaíba (mock)', tipo: 'poligono', descricao: '', especie_slug: null },
      geometry: { type: 'Polygon', coordinates: [[[-41.95, -2.75], [-41.4, -2.75], [-41.4, -3.2], [-41.95, -2.75]]] },
    },
  ],
}

function configurarFetch(rotas: Record<string, unknown>) {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    const rota = String(entrada)
    if (rotas[rota]) {
      return { ok: true, json: async () => rotas[rota] }
    }
    return { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

const instancia = () => estadoMapa.instancias[estadoMapa.instancias.length - 1]

afterEach(() => {
  cleanup()
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-3: geometrias do backend carregadas no mapa', () => {
  it('adiciona source GeoJSON e layers de ponto, linha e polígono', async () => {
    configurarFetch({ '/api/geometrias/': FEATURE_COLLECTION })
    render(<MapView />)
    await vi.waitFor(() => {
      expect(instancia().addSource).toHaveBeenCalledWith(
        'geometrias',
        expect.objectContaining({ type: 'geojson' }),
      )
    })
    const [idSource, source] = instancia().addSource.mock.calls[0]
    expect(idSource).toBe('geometrias')
    expect(source.data).toMatchObject({
      type: 'FeatureCollection',
      features: expect.arrayContaining([
        expect.objectContaining({ properties: expect.objectContaining({ total: 223 }) }),
      ]),
    })
    const idsCamadas = instancia().addLayer.mock.calls.map((call: any) => call[0].id)
    expect(idsCamadas).toEqual(['camada-pontos', 'camada-linhas', 'camada-poligonos'])
    expect(document.body.querySelector('[data-testid="pin-parnaiba"]')).not.toBeNull()
    expect(screen.queryByTestId('mapa-erro')).toBeNull()
  })
})
