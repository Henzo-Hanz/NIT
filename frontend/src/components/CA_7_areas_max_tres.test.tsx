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

const ESPECIES_AREA = [
  { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 2 },
  { slug: 'guaiamum', nome_popular: 'Guaiamum', contagem: 1 },
]

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    if (String(entrada) === '/api/consulta/area/') {
      return {
        ok: true,
        json: async () => ({
          especies: ESPECIES_AREA,
          pontos: { type: 'FeatureCollection', features: [] },
        }),
      }
    }
    return { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

async function desenhar(container: HTMLElement, deslocamento: number) {
  fireEvent.mouseDown(container, {
    clientX: 10 + deslocamento,
    clientY: 10 + deslocamento,
  })
  fireEvent.mouseMove(container, {
    clientX: 30 + deslocamento,
    clientY: 10 + deslocamento,
  })
  fireEvent.mouseMove(container, {
    clientX: 20 + deslocamento,
    clientY: 20 + deslocamento,
  })
  fireEvent.mouseUp(container)
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-7: listas de áreas e espécies rolam com no máximo três itens visíveis', () => {
  it('a lista de áreas e a de espécies usam max-h de três itens com rolagem invisível', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    await desenhar(container, 0)
    await desenhar(container, 40)
    await desenhar(container, 80)
    await desenhar(container, 120)

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-4')).toBeInTheDocument()
    })

    const listaAreas = screen.getByTestId('painel-areas').querySelector('ul')
    expect(listaAreas).not.toBeNull()
    expect(listaAreas?.className).toContain('max-h-[7.5rem]')
    expect(listaAreas?.className).toContain('overflow-y-auto')
    expect(listaAreas?.className).toContain('no-scrollbar')

    const especie = await screen.findByTestId('filtro-especie-caranguejo-uca')
    const listaEspecies = especie.closest('ul')
    expect(listaEspecies).not.toBeNull()
    expect(listaEspecies?.className).toContain('max-h-[7.5rem]')
    expect(listaEspecies?.className).toContain('overflow-y-auto')
    expect(listaEspecies?.className).toContain('no-scrollbar')
  })
})
