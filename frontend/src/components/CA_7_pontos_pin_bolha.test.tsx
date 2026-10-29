import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'

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

const ESPECIES_AREA = [
  { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 2 },
  { slug: 'guaiamum', nome_popular: 'Guaiamum', contagem: 1 },
]

const PONTOS = [
  {
    type: 'Feature',
    properties: {
      id: 1,
      nome: 'Jericoacoara',
      descricao: '2 espécies encontradas',
      especie_slugs: ['caranguejo-uca', 'guaiamum'],
      total: 2,
    },
    geometry: { type: 'Point', coordinates: [-40.513, -2.797] },
  },
  {
    type: 'Feature',
    properties: {
      id: 2,
      nome: 'Camocim',
      descricao: '1 espécie encontrada',
      especie_slugs: ['caranguejo-uca'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [-40.84, -2.9] },
  },
]

const FICHA_GUAIAMUM = {
  slug: 'guaiamum',
  nome_popular: 'Guaiamum',
  nome_cientifico: 'Cardisoma guanhumi',
  descricao: 'Ficha mockada do guaiamum.',
  infos: { habitat: 'Manguezal' },
  imagem: '',
}

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    const rota = String(entrada)
    if (rota === '/api/consulta/area/') {
      return {
        ok: true,
        json: async () => ({
          especies: ESPECIES_AREA,
          pontos: { type: 'FeatureCollection', features: PONTOS },
        }),
      }
    }
    if (rota === '/api/especies/guaiamum/') {
      return { ok: true, json: async () => FICHA_GUAIAMUM }
    }
    return { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-7: pontos do resultado, pin e bolha de área', () => {
  it('mostra os pontos como círculos e nenhum pin sobe sozinho', async () => {
    configurarFetch()
    render(<App />)

    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })
    expect(screen.queryByTestId('pin-area')).toBeNull()
    expect(screen.queryByTestId('bolha-area')).toBeNull()
  })

  it('clicar no ponto sobe o pin e abre a bolha com a contagem', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<App />)

    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })
    await usuario.click(screen.getAllByTestId('ponto-area')[0])

    expect(screen.getByTestId('pin-area')).toBeInTheDocument()
    expect(screen.getByTestId('bolha-area')).toHaveTextContent('2 espécies encontradas')
    expect(screen.getByTestId('ver-especies-area')).toBeInTheDocument()
  })

  it('Ver espécies lista as espécies do ponto e a ficha abre no modal', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<App />)

    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })
    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    await usuario.click(screen.getByTestId('ver-especies-area'))

    const lista = screen.getByTestId('lista-especies-area')
    expect(lista).toBeInTheDocument()
    expect(screen.getByTestId('area-especie-caranguejo-uca')).toHaveTextContent('Caranguejo-uçá')
    expect(screen.getByTestId('area-especie-guaiamum')).toHaveTextContent('Guaiamum')

    await usuario.click(screen.getByTestId('area-especie-guaiamum'))
    expect(await screen.findByTestId('modal-especie')).toBeInTheDocument()
    expect(screen.getByTestId('nome-popular-modal')).toHaveTextContent('Guaiamum')
  })
})
