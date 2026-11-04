import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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

const FEATURE_COLLECTION = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 1,
        nome: 'Parnaíba',
        tipo: 'ponto',
        descricao: 'Ponto de monitoramento do litoral do Parnaíba',
        especie_slug: null,
      },
      geometry: { type: 'Point', coordinates: [-41.7767, -2.9035] },
    },
  ],
}

const PONTOS_CONSULTA = [
  {
    type: 'Feature',
    properties: {
      id: 7,
      nome: 'Parnaíba',
      descricao: '1 espécie encontrada',
      especie_slugs: ['caranguejo-uca'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [-41.7767, -2.9035] },
  },
]

const ESPECIES_AREA = [{ slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 1 }]

function configurarFetch(rotas: Record<string, unknown>) {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    const rota = String(entrada)
    if (rotas[rota] !== undefined) {
      return { ok: true, json: async () => rotas[rota] }
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

// Lapidação 4: o pin do Parnaíba não sobe sozinho na carga; o fluxo de pin e
// bolha vale para PONTOS (1º clique = pin sem bolha, 2º clique = bolha).
describe('CA-4: nenhum pin automático na carga e fluxo de pin/bolha do ponto', () => {
  it('a carga das geometrias não sobe nenhum pin (nem o do Parnaíba)', async () => {
    configurarFetch({ '/api/geometrias/': FEATURE_COLLECTION })
    render(<MapView />)
    await vi.waitFor(() => {
      expect(document.body.querySelector('[data-testid="pin-parnaiba"]')).toBeNull()
    })
    expect(document.body.querySelector('[data-testid="pin-area"]')).toBeNull()
    expect(screen.queryByTestId('bolha-parnaiba')).toBeNull()
    expect(screen.queryByTestId('bolha-area')).toBeNull()
  })

  it('1º clique no ponto mostra o pin SEM bolha; 2º clique abre a bolha', async () => {
    const usuario = userEvent.setup()
    configurarFetch({
      '/api/consulta/area/': {
        especies: ESPECIES_AREA,
        pontos: { type: 'FeatureCollection', features: PONTOS_CONSULTA },
      },
    })
    render(<MapView />)
    const ponto = await screen.findByTestId('ponto-area')

    await usuario.click(ponto)
    const pin = screen.getByTestId('pin-area')
    expect(pin.querySelector('image[data-icono-phylopic]')?.getAttribute('href')).toBe(
      '/api/especies/caranguejo-uca/icone/',
    )
    expect(screen.queryByTestId('bolha-area')).toBeNull()

    await usuario.click(ponto)
    expect(screen.getByTestId('bolha-area')).toHaveTextContent('1 espécie encontrada')
  })

  it('fechar a bolha mantém o pin e clicar fora fecha o pin por inteiro', async () => {
    const usuario = userEvent.setup()
    configurarFetch({
      '/api/consulta/area/': {
        especies: ESPECIES_AREA,
        pontos: { type: 'FeatureCollection', features: PONTOS_CONSULTA },
      },
    })
    render(<MapView />)
    const ponto = await screen.findByTestId('ponto-area')
    await usuario.click(ponto)
    await usuario.click(ponto)
    expect(screen.getByTestId('bolha-area')).toBeInTheDocument()

    await usuario.click(screen.getByTestId('fechar-bolha-area'))
    expect(screen.queryByTestId('bolha-area')).toBeNull()
    expect(screen.getByTestId('pin-area')).toBeInTheDocument()

    // 2º clique reabre a bolha — o pin ficou.
    await usuario.click(ponto)
    expect(screen.getByTestId('bolha-area')).toBeInTheDocument()

    // Clique livre fora do pin: fechar pin remove pin + bolha. A saída do pin
    // é ANIMADA (SPEC-0005): classe `pin-sumir` antes da remoção real.
    await usuario.click(screen.getByTestId('mapa-container'))
    expect(screen.queryByTestId('bolha-area')).toBeNull()
    const pinSaindo = screen.getByTestId('pin-area')
    expect(pinSaindo.classList).toContain('pin-sumir')
    pinSaindo.dispatchEvent(new Event('animationend'))
    expect(screen.queryByTestId('pin-area')).toBeNull()
  })

  it('a espécie da bolha abre a ficha no modal como hoje', async () => {
    const usuario = userEvent.setup()
    const aoAbrir = vi.fn()
    configurarFetch({
      '/api/consulta/area/': {
        especies: ESPECIES_AREA,
        pontos: { type: 'FeatureCollection', features: PONTOS_CONSULTA },
      },
    })
    render(<MapView onAbrirEspecie={aoAbrir} />)
    const ponto = await screen.findByTestId('ponto-area')
    await usuario.click(ponto)
    await usuario.click(ponto)
    await usuario.click(screen.getByTestId('area-especie-caranguejo-uca'))
    expect(aoAbrir).toHaveBeenCalledWith('caranguejo-uca')
    // A ficha fecha o pin: bolha sai na hora, o pin sai ANIMADO (SPEC-0005).
    const pinSaindo = screen.getByTestId('pin-area')
    expect(pinSaindo.classList).toContain('pin-sumir')
    pinSaindo.dispatchEvent(new Event('animationend'))
    expect(screen.queryByTestId('pin-area')).toBeNull()
  })

  it('a tecla Esc fecha a bolha e mantém o pin', async () => {
    const usuario = userEvent.setup()
    configurarFetch({
      '/api/consulta/area/': {
        especies: ESPECIES_AREA,
        pontos: { type: 'FeatureCollection', features: PONTOS_CONSULTA },
      },
    })
    render(<MapView />)
    const ponto = await screen.findByTestId('ponto-area')
    await usuario.click(ponto)
    await usuario.click(ponto)
    expect(screen.getByTestId('bolha-area')).toBeInTheDocument()

    await usuario.keyboard('{Escape}')
    expect(screen.queryByTestId('bolha-area')).toBeNull()
    expect(screen.getByTestId('pin-area')).toBeInTheDocument()
  })
})
