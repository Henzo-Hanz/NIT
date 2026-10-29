import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapView } from './MapView'
import { CamadasPanel } from './CamadasPanel'
import type { TipoGeometria } from '../lib/api'

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

const chamadasVisibilidade = () =>
  instancia().setLayoutProperty.mock.calls.filter((call: any[]) => call[1] === 'visibility')

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-7: filtros de camadas controlam visibilidade no mapa', () => {
  it('painel inicia com os três tipos ligados e alterna o callback', async () => {
    const usuario = userEvent.setup()
    const camadas: Record<TipoGeometria, boolean> = { ponto: true, linha: true, poligono: true }
    const aoAlternar = vi.fn()
    render(<CamadasPanel camadasAtivas={camadas} aoAlternar={aoAlternar} />)
    for (const tipo of ['ponto', 'linha', 'poligono']) {
      expect(screen.getByTestId(`camada-${tipo}`)).toHaveAttribute('aria-pressed', 'true')
    }
    await usuario.click(screen.getByTestId('camada-poligono'))
    expect(aoAlternar).toHaveBeenCalledWith('poligono')
  })

  it('MapView esconde a layer de polígonos quando o filtro desliga e volta ao ligar', async () => {
    const camadasDesligadas: Record<TipoGeometria, boolean> = {
      ponto: true,
      linha: true,
      poligono: false,
    }
    const camadasLigadas: Record<TipoGeometria, boolean> = {
      ponto: true,
      linha: true,
      poligono: true,
    }
    configurarFetch({ '/api/geometrias/': FEATURE_COLLECTION })
    const { rerender } = render(<MapView camadasAtivas={camadasDesligadas} />)
    await vi.waitFor(() => {
      expect(instancia().addSource).toHaveBeenCalled()
    })
    await vi.waitFor(() => {
      const ultimas = chamadasVisibilidade()
      expect(ultimas).toEqual(
        expect.arrayContaining([
          ['camada-poligonos', 'visibility', 'none'],
          ['camada-pontos', 'visibility', 'visible'],
        ]),
      )
    })
    rerender(<MapView camadasAtivas={camadasLigadas} />)
    await vi.waitFor(() => {
      const ultimas = chamadasVisibilidade()
      expect(ultimas[ultimas.length - 1]).toEqual(['camada-poligonos', 'visibility', 'visible'])
    })
  })
})
