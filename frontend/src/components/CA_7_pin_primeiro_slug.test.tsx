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

const PONTO_BADEJO = {
  type: 'Feature',
  properties: {
    id: 3,
    nome: 'Delta do Parnaíba',
    descricao: '2 espécies encontradas',
    especie_slugs: ['badejo', 'guaiamum'],
    total: 2,
  },
  geometry: { type: 'Point', coordinates: [-41.75, -2.9] },
}

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    const rota = String(entrada)
    if (rota === '/api/consulta/area/') {
      return {
        ok: true,
        json: async () => ({
          especies: [
            { slug: 'badejo', nome_popular: 'Badejo', contagem: 2 },
            { slug: 'guaiamum', nome_popular: 'Guaiamum', contagem: 1 },
          ],
          pontos: { type: 'FeatureCollection', features: [PONTO_BADEJO] },
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
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('O pin de um ponto sem caranguejo pede o ícone do PRIMEIRO slug e só ele fica visível', async () => {
  const usuario = userEvent.setup()
  configurarFetch()
  render(<MapView />)
  const ponto = await screen.findByTestId('ponto-area')
  await usuario.click(ponto)

  const pin = screen.getByTestId('pin-area')
  const imagens = pin.querySelectorAll('image[data-icono-phylopic]')
  expect(imagens).toHaveLength(2)

  expect(imagens[0].getAttribute('href')).toBe('/api/especies/badejo/icone/')
  expect(imagens[0].getAttribute('data-indice')).toBe('0')
  expect((imagens[0] as SVGImageElement).style.display).not.toBe('none')

  expect(imagens[1].getAttribute('href')).toBe('/api/especies/guaiamum/icone/')
  expect(imagens[1].getAttribute('data-indice')).toBe('1')
  expect((imagens[1] as SVGImageElement).style.display).toBe('none')

  expect(imagens[0].getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
  expect(imagens[1].getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')

  expect(pin.querySelector('[data-fallback-crab]')).toBeNull()
})
