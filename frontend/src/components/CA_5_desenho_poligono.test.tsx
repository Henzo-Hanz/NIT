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

function configurarFetch() {
  const fetchFake = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

const instancia = () => estadoMapa.instancias[estadoMapa.instancias.length - 1]

const consultas = (fetchFake: ReturnType<typeof vi.fn>) =>
  fetchFake.mock.calls.filter((chamada: any[]) => chamada[0] === '/api/consulta/area/')

const corpoDaConsulta = (chamada: any[]) => JSON.parse(String(chamada[1].body))

async function desenhar(container: HTMLElement, pontos: [number, number][]) {
  fireEvent.mouseDown(container, { clientX: pontos[0][0], clientY: pontos[0][1] })
  for (const [x, y] of pontos.slice(1)) {
    fireEvent.mouseMove(container, { clientX: x, clientY: y })
  }
  fireEvent.mouseUp(container)
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-5: desenho livre de polígono sobre o mapa', () => {
  it('mouseDown + movimentos + mouseUp fecham o anel e consultam a área', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    await desenhar(container, [
      [10, 10],
      [20, 20],
      [30, 30],
    ])

    await vi.waitFor(() => {
      expect(container.getAttribute('data-poligono-desenhado')).not.toBeNull()
    })
    const poligono = JSON.parse(container.getAttribute('data-poligono-desenhado') as string)
    expect(poligono.type).toBe('Polygon')
    expect(poligono.coordinates).toHaveLength(1)
    expect(poligono.coordinates[0]).toEqual([
      [10, 10],
      [20, 20],
      [30, 30],
      [10, 10],
    ])

    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      expect(chamadas.length).toBeGreaterThan(0)
      expect(corpoDaConsulta(chamadas[chamadas.length - 1]).poligono).toEqual(poligono)
    })
  })

  it('um segundo desenho adiciona uma nova área sem substituir a anterior', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    await desenhar(container, [
      [10, 10],
      [20, 20],
      [30, 30],
    ])
    await vi.waitFor(() => {
      expect(container.getAttribute('data-poligono-desenhado')).toContain('[[10,10]')
    })

    await desenhar(container, [
      [40, 40],
      [50, 50],
      [60, 60],
    ])
    await vi.waitFor(() => {
      expect(container.getAttribute('data-poligono-desenhado')).toContain('[[40,40]')
    })
    const poligono = JSON.parse(container.getAttribute('data-poligono-desenhado') as string)
    expect(poligono.coordinates[0][0]).toEqual([40, 40])
    expect(poligono.coordinates[0]).toHaveLength(4)

    const fonte = instancia().getSource.mock.results[instancia().getSource.mock.results.length - 1]
      .value
    const dados = fonte.setData.mock.calls.at(-1)?.[0]
    expect(dados.features).toHaveLength(2)
    expect(dados.features[0].geometry.coordinates[0][0]).toEqual([10, 10])
    expect(dados.features[1].geometry.coordinates[0][0]).toEqual([40, 40])
  })

  it('no modo arrastar nada é desenhado e a consulta segue sem polígono', async () => {
    const fetchFake = configurarFetch()
    render(<MapView />)

    const container = screen.getByTestId('mapa-container')
    await desenhar(container, [
      [10, 10],
      [20, 20],
      [30, 30],
    ])

    expect(container.getAttribute('data-poligono-desenhado')).toBeNull()
    for (const chamada of consultas(fetchFake)) {
      expect(corpoDaConsulta(chamada).poligono).toBeNull()
    }
  })
})
