import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapView } from './MapView'

const estadoMapa = vi.hoisted(() => ({
  instancias: [] as any[],
  disparoImediato: true,
  // Centro do mapa fake usado quando não há posição de ponteiro válida.
  centro: { lng: 200, lat: 100 },
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
    project = vi.fn((coordenadas: [number, number]) => ({ x: coordenadas[0], y: coordenadas[1] }))
    // Identidade, exceto coordenadas sentinela (>= 900) que simulam unproject
    // inválido para exercitar o fallback do centro da viewport.
    unproject = vi.fn(([x, y]: [number, number]) =>
      x >= 900 || y >= 900 ? [Number.NaN, Number.NaN] : [x, y],
    )
    getCenter = vi.fn(() => estadoMapa.centro)
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

function configurarFetch() {
  const fetchFake = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

const poligonoExibido = (container: HTMLElement) =>
  JSON.parse(container.getAttribute('data-poligono-desenhado') as string)

const centroDoAnel = (anel: number[][]): [number, number] => {
  const pontos = anel.slice(0, -1)
  const lons = pontos.map((ponto) => ponto[0])
  const lats = pontos.map((ponto) => ponto[1])
  return [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]
}

async function desenharECopiar(usuario: ReturnType<typeof userEvent.setup>) {
  render(<MapView />)
  await usuario.click(screen.getByTestId('ferramenta-desenhar'))
  const container = screen.getByTestId('mapa-container')
  fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
  fireEvent.mouseMove(container, { clientX: 30, clientY: 10 })
  fireEvent.mouseMove(container, { clientX: 20, clientY: 20 })
  fireEvent.mouseUp(container)
  await vi.waitFor(() => {
    expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
  })
  const original = poligonoExibido(container).coordinates[0] as number[][]
  await usuario.click(screen.getByTestId('selecionar-area-1'))
  fireEvent.keyDown(document, { key: 'c', ctrlKey: true })
  return { container, original }
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// CA-6: o colar centraliza a cópia na coordenada do ponteiro (forma/tamanho
// preservados); sem posição válida, usa o centro da viewport.
describe('CA-6: colar na posição do ponteiro', () => {
  it('centraliza o bbox da cópia na coordenada do ponteiro', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    const { container, original } = await desenharECopiar(usuario)

    fireEvent.mouseMove(container, { clientX: 100, clientY: 80 })
    fireEvent.keyDown(document, { key: 'v', ctrlKey: true })

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-2')).toBeInTheDocument()
    })
    const colada = poligonoExibido(container).coordinates[0] as number[][]

    expect(colada).toHaveLength(original.length)
    const [centroLon, centroLat] = centroDoAnel(colada)
    expect(centroLon).toBeCloseTo(100, 6)
    expect(centroLat).toBeCloseTo(80, 6)

    // Translação pura: todos os vértices recebem o MESMO delta.
    const deltaLon = colada[0][0] - original[0][0]
    const deltaLat = colada[0][1] - original[0][1]
    colada.forEach((ponto, indice) => {
      expect(ponto[0] - original[indice][0]).toBeCloseTo(deltaLon, 6)
      expect(ponto[1] - original[indice][1]).toBeCloseTo(deltaLat, 6)
    })
  })

  it('sem posição de ponteiro válida, centraliza no centro da viewport', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    const { container } = await desenharECopiar(usuario)

    // Sentinela: unproject devolve NaN, forçando o fallback da viewport.
    fireEvent.mouseMove(container, { clientX: 999, clientY: 999 })
    fireEvent.keyDown(document, { key: 'v', ctrlKey: true })

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-2')).toBeInTheDocument()
    })
    const colada = poligonoExibido(container).coordinates[0] as number[][]
    const [centroLon, centroLat] = centroDoAnel(colada)
    expect(centroLon).toBeCloseTo(estadoMapa.centro.lng, 6)
    expect(centroLat).toBeCloseTo(estadoMapa.centro.lat, 6)
  })
})
