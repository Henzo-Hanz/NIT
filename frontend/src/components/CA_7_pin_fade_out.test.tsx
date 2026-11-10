import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapView } from './MapView'

const estadoMapa = vi.hoisted(() => ({
  instancias: [] as any[],
  disparoImediato: true,
  soGetElement: false,
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
    elementoInterno: any
    element: any
    setLngLat = vi.fn().mockReturnThis()
    remove = vi.fn()
    // Lapidação 11: no runtime real (maplibre 6.15) o acesso ao elemento é via
    // getElement() — o fake expõe getElement SEMPRE; `element` só no modo
    // clássico exercita o último elo do fallback, e o modo `soGetElement`
    // deixa o accessor como ÚNICO caminho (sem prop direta).
    getElement = () => this.elementoInterno
    constructor(opcoes: { element?: HTMLElement }) {
      this.elementoInterno = opcoes?.element
      if (!estadoMapa.soGetElement) {
        this.element = opcoes?.element
      }
    }
    addTo = vi.fn(() => {
      if (this.elementoInterno) {
        document.body.appendChild(this.elementoInterno)
      }
      return this
    })
  }
  return { Map: MapFake, Marker: MarkerFake }
})

const PONTOS = [
  {
    type: 'Feature',
    properties: {
      id: 1,
      nome: 'Jericoacoara',
      descricao: '1 espécie encontrada',
      especie_slugs: ['caranguejo-uca'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [-40.513, -2.797] },
  },
  {
    type: 'Feature',
    properties: {
      id: 2,
      nome: 'Camocim',
      descricao: '1 espécie encontrada',
      especie_slugs: ['guaiamum'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [-40.84, -2.9] },
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
          pontos: { type: 'FeatureCollection', features: PONTOS },
        }),
      }
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
  estadoMapa.soGetElement = false
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// SPEC-0005: o pin de ponto/área sai com fade-out (`pin-sumir`) — a remoção
// real acontece só no fim da animação (ou na guarda de 250ms), coerente com
// a entrada `pin-crescer`.
describe('CA-7: fade-out do pin ao sair', () => {
  it('clique fora adiciona a classe pin-sumir ANTES da remoção e animationend remove', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    const ponto = (await screen.findAllByTestId('ponto-area'))[0]
    await usuario.click(ponto)
    expect(screen.getByTestId('pin-area')).toBeInTheDocument()

    await usuario.click(screen.getByTestId('mapa-container'))
    // Ainda na DOM: saída animada em curso.
    const pinSaindo = screen.getByTestId('pin-area')
    expect(pinSaindo.classList).toContain('pin-sumir')
    expect(pinSaindo.querySelector('.pin-area-crescer')).not.toBeNull()

    pinSaindo.dispatchEvent(new Event('animationend'))
    expect(screen.queryByTestId('pin-area')).toBeNull()
  })

  it('sem animationend o pin também sai pela guarda de 250ms (sem pin fantasma)', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    const ponto = (await screen.findAllByTestId('ponto-area'))[0]
    await usuario.click(ponto)
    expect(screen.getByTestId('pin-area')).toBeInTheDocument()

    await usuario.click(screen.getByTestId('mapa-container'))
    const pinSaindo = screen.getByTestId('pin-area')
    expect(pinSaindo.classList).toContain('pin-sumir')

    // Ninguém despacha animationend: a guarda derruba o elemento.
    await vi.waitFor(() => {
      expect(screen.queryByTestId('pin-area')).toBeNull()
    })
  })

  it('trocar de ponto: o pin velho sai em pin-sumir e o novo entra sem a classe', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    const pontos = await screen.findAllByTestId('ponto-area')
    await usuario.click(pontos[0])

    await usuario.click(screen.getAllByTestId('ponto-area')[1])

    const pins = screen.getAllByTestId('pin-area')
    expect(pins).toHaveLength(2)
    const velho = pins.find((pin) => pin.classList.contains('pin-sumir'))!
    const novo = pins.find((pin) => !pin.classList.contains('pin-sumir'))!
    expect(velho.getAttribute('aria-label')).toBe('Jericoacoara')
    expect(novo.getAttribute('aria-label')).toBe('Camocim')

    velho.dispatchEvent(new Event('animationend'))
    expect(screen.getAllByTestId('pin-area')).toHaveLength(1)
    expect(screen.getByTestId('pin-area').getAttribute('aria-label')).toBe('Camocim')
  })

  it('fake SÓ com getElement (runtime real): a classe pin-sumir chega no elemento do marker', async () => {
    const usuario = userEvent.setup()
    estadoMapa.soGetElement = true
    configurarFetch()
    render(<MapView />)
    const ponto = (await screen.findAllByTestId('ponto-area'))[0]
    await usuario.click(ponto)
    expect(screen.getByTestId('pin-area')).toBeInTheDocument()

    await usuario.click(screen.getByTestId('mapa-container'))
    const pinSaindo = screen.getByTestId('pin-area')
    expect(pinSaindo.classList).toContain('pin-sumir')

    pinSaindo.dispatchEvent(new Event('animationend'))
    expect(screen.queryByTestId('pin-area')).toBeNull()
  })
})
