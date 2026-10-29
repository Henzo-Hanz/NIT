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

const ESPECIES = [
  {
    slug: 'caranguejo-uca',
    nome_popular: 'Caranguejo-uçá',
    nome_cientifico: 'Ucides cordatus',
    imagem: 'biodiversidade/midia/caranguejo-uca.svg',
  },
  {
    slug: 'caranguejo-maria-farinha',
    nome_popular: 'Caranguejo maria-farinha',
    nome_cientifico: 'Ocypode quadrata',
    imagem: 'biodiversidade/midia/caranguejo-maria-farinha.svg',
  },
  {
    slug: 'caranguejeiro-laranja-do-norte',
    nome_popular: 'Caranguejeiro-laranja-do-norte',
    nome_cientifico: null,
    imagem: 'biodiversidade/midia/caranguejeiro-laranja-do-norte.svg',
  },
]

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    const rota = String(entrada)
    if (rota === '/api/ping/') {
      return { ok: true, json: async () => ({ status: 'ok' }) }
    }
    if (rota === '/api/especies/') {
      return { ok: true, json: async () => ESPECIES }
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

describe('CA-6: busca por nome na listagem de espécies', () => {
  it('filtra os cards pelo nome popular ou científico e avisa quando nada casa', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<App />)

    await usuario.click(screen.getByTestId('nav-espécies'))
    const busca = await screen.findByTestId('busca-especies')
    expect(await screen.findByTestId('card-especie-caranguejo-uca')).toBeInTheDocument()

    await usuario.type(busca, 'maria')
    expect(screen.getByTestId('card-especie-caranguejo-maria-farinha')).toBeInTheDocument()
    expect(screen.queryByTestId('card-especie-caranguejo-uca')).toBeNull()
    expect(screen.queryByTestId('busca-vazia')).toBeNull()

    await usuario.clear(busca)
    await usuario.type(busca, 'Ucides')
    expect(screen.getByTestId('card-especie-caranguejo-uca')).toBeInTheDocument()
    expect(screen.queryByTestId('card-especie-caranguejo-maria-farinha')).toBeNull()

    await usuario.clear(busca)
    await usuario.type(busca, 'inexistente')
    expect(screen.getByTestId('busca-vazia')).toBeInTheDocument()
    expect(screen.queryByTestId('card-especie-caranguejo-uca')).toBeNull()
  })
})
