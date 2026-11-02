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

const PONTO_PARNAIBA = {
  type: 'Feature',
  properties: {
    id: 1,
    nome: 'Parnaíba',
    descricao: '223 espécies de caranguejos encontradas',
    especie_slugs: [],
    total: 223,
  },
  geometry: { type: 'Point', coordinates: [-41.7767, -2.9035] },
}

const ESPECIES = [
  {
    slug: 'caranguejo-uca',
    nome_popular: 'Caranguejo-uçá',
    nome_cientifico: 'Ucides cordatus',
    imagem: 'biodiversidade/midia/caranguejo-uca.svg',
  },
  {
    slug: 'guaiamum',
    nome_popular: 'Guaiamum',
    nome_cientifico: 'Cardisoma guanhumi',
    imagem: 'biodiversidade/midia/guaiamum.svg',
  },
]

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    const rota = String(entrada)
    if (rota === '/api/consulta/area/') {
      return {
        ok: true,
        json: async () => ({
          especies: [],
          pontos: { type: 'FeatureCollection', features: [PONTO_PARNAIBA] },
        }),
      }
    }
    if (rota === '/api/especies/') {
      return { ok: true, json: async () => ESPECIES }
    }
    return { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

async function desenharArea(container: HTMLElement) {
  fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
  fireEvent.mouseMove(container, { clientX: 30, clientY: 10 })
  fireEvent.mouseMove(container, { clientX: 20, clientY: 20 })
  fireEvent.mouseUp(container)
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-7: ponto da Parnaíba sem espécie dentro do resultado da consulta', () => {
  it('aparece como bolinha, abre a bolha de área e lista todas as espécies', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await desenharArea(screen.getByTestId('mapa-container'))

    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(1)
    })

    await usuario.click(screen.getByTestId('ponto-area'))

    const bolha = screen.getByTestId('bolha-area')
    expect(bolha).toHaveTextContent('223 espécies de caranguejos encontradas')
    expect(screen.getByTestId('ver-especies-area')).toBeInTheDocument()

    await usuario.click(screen.getByTestId('ver-especies-area'))

    await vi.waitFor(() => {
      expect(fetchFake).toHaveBeenCalledWith('/api/especies/')
    })
    expect(screen.getByTestId('lista-especies-area')).toBeInTheDocument()
    expect(screen.getByTestId('especie-opcao-caranguejo-uca')).toHaveTextContent('Caranguejo-uçá')
    expect(screen.getByTestId('especie-opcao-guaiamum')).toHaveTextContent('Guaiamum')
  })
})
