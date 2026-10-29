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

const AREA_1: [number, number][] = [
  [-41.8, -2.9],
  [-41.7, -2.9],
  [-41.75, -3.0],
]

const AREA_2: [number, number][] = [
  [-42.0, -3.2],
  [-41.9, -3.2],
  [-41.95, -3.3],
]

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

describe('CA-7: áreas desenhadas podem ser selecionadas e apagadas', () => {
  it('desenha duas áreas, seleciona uma e apaga uma refazendo a consulta', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    await desenhar(container, AREA_1)
    await desenhar(container, AREA_2)

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    expect(screen.getByTestId('area-item-2')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^selecionar-area-/)).toHaveLength(2)
    expect(screen.getAllByTestId(/^apagar-area-/)).toHaveLength(2)

    await vi.waitFor(() => {
      const comPoligono = consultas(fetchFake).filter(
        (chamada: any[]) => corpoDaConsulta(chamada).poligono !== null,
      )
      expect(comPoligono.length).toBeGreaterThanOrEqual(2)
    })

    await usuario.click(screen.getByTestId('selecionar-area-1'))
    expect(screen.getByTestId('selecionar-area-1')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('selecionar-area-2')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('area-item-1')).toHaveAttribute('data-ativa', 'true')

    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      const ultima = chamadas[chamadas.length - 1]
      expect(corpoDaConsulta(ultima).poligono.coordinates[0][0]).toEqual(AREA_1[0])
    })

    const antesDeApagar = consultas(fetchFake).length
    await usuario.click(screen.getByTestId('apagar-area-1'))

    await vi.waitFor(() => {
      expect(screen.queryByTestId('area-item-1')).toBeNull()
    })
    expect(screen.getByTestId('area-item-2')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^area-item-/)).toHaveLength(1)
    expect(screen.getByTestId('selecionar-area-2')).toHaveAttribute('aria-pressed', 'false')

    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      expect(chamadas.length).toBeGreaterThan(antesDeApagar)
      const ultima = chamadas[chamadas.length - 1]
      expect(corpoDaConsulta(ultima).poligono.coordinates[0][0]).toEqual(AREA_2[0])
    })
  })

  it('sem área ativa a consulta usa todas as áreas; sem nenhuma área usa o Brasil', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    render(<MapView />)

    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      expect(chamadas.length).toBeGreaterThan(0)
      expect(corpoDaConsulta(chamadas[chamadas.length - 1]).poligono).toBeNull()
    })
    expect(screen.getByTestId('filtro-escopo')).toHaveTextContent('todo o Brasil')

    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await desenhar(screen.getByTestId('mapa-container'), AREA_1)
    await desenhar(screen.getByTestId('mapa-container'), AREA_2)

    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      const ultima = chamadas[chamadas.length - 1]
      expect(corpoDaConsulta(ultima).poligono.coordinates[0][0]).toEqual(AREA_2[0])
    })
    expect(screen.getByTestId('filtro-escopo')).toHaveTextContent('área desenhada')
  })
})
