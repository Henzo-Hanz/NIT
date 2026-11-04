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
    project = vi.fn((coordenadas: [number, number]) => ({ x: coordenadas[0], y: coordenadas[1] }))
    unproject = vi.fn(([x, y]: [number, number]) => [x, y])
    getSource = vi.fn().mockImplementation(() => null)
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

const consultas = (fetchFake: ReturnType<typeof vi.fn>) =>
  fetchFake.mock.calls.filter((chamada: any[]) => chamada[0] === '/api/consulta/area/')

const corpoDaConsulta = (chamada: any[]) => JSON.parse(String(chamada[1].body))

const borracha = () => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
}

afterEach(borracha)

async function desenharTriangulo(usuario: ReturnType<typeof userEvent.setup>) {
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
  return container
}

// Lapidação 7: seleção de área com estado VISÍVEL distinto (data-selecionada +
// destaque âmbar no painel e no polígono) e fantasma em tempo real durante o
// mover — contorno tracejado translúcido que acompanha o arraste e some ao
// soltar (a reconsulta de sempre permanece).
describe('CA-5: seleção de área e fantasma do mover', () => {
  it('clicar na área no painel marca SELECIONADA no painel e no polígono', async () => {
    const usuario = userEvent.setup()
    const container = await desenharTriangulo(usuario)
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))
    await usuario.click(screen.getByTestId('selecionar-area-1'))

    const item = screen.getByTestId('area-item-1')
    expect(item).toHaveAttribute('data-selecionada', 'true')
    expect(item).toHaveClass('border-amber-500', 'dark:border-amber-400')
    expect(screen.getByTestId('alcas-area')).toHaveAttribute('data-selecionada', 'true')

    // Clique fora de QUALQUER área ((60,60) está fora do triângulo) desmarca.
    fireEvent.click(container, { clientX: 60, clientY: 60 })
    expect(item).toHaveAttribute('data-selecionada', 'false')
    expect(screen.getByTestId('alcas-area')).toHaveAttribute('data-selecionada', 'false')
  })

  it('alternar ferramenta desmarca a área selecionada', async () => {
    const usuario = userEvent.setup()
    await desenharTriangulo(usuario)
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    expect(screen.getByTestId('area-item-1')).toHaveAttribute('data-selecionada', 'true')

    await usuario.click(screen.getByTestId('ferramenta-medir'))
    expect(screen.getByTestId('area-item-1')).toHaveAttribute('data-selecionada', 'false')
  })

  it('o fantasma acompanha o mover ao vivo e some ao soltar, com a reconsulta intacta', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    const container = await desenharTriangulo(usuario)
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    expect(screen.queryByTestId('fantasma-area')).toBeNull()

    // (18,12) está dentro do triângulo: começa o mover.
    fireEvent.mouseDown(container, { clientX: 18, clientY: 12 })
    expect(container).toHaveAttribute('data-editando', 'true')

    const fantasma = screen.getByTestId('fantasma-area')
    const contorno = (el: HTMLElement) => el.querySelector('polyline') as SVGPolylineElement
    expect(contorno(fantasma)).toHaveAttribute('points', '10,10 30,10 20,20 10,10')
    expect(contorno(fantasma)).toHaveAttribute('stroke-dasharray', '6 4')

    // Formas de arrematar: a mãozinha vai em (+5,+5); o contorno acompanha
    // direto no overlay (translação de todos os vértices).
    fireEvent.mouseMove(window, { clientX: 23, clientY: 17 })
    expect(contorno(fantasma)).toHaveAttribute('points', '15,15 35,15 25,25 15,15')
    expect(contorno(fantasma)).toHaveAttribute('fill', 'rgba(217,119,6,0.15)')

    // Ao soltar: fantasma removido e a reconsulta recebe o polígono novo.
    fireEvent.mouseUp(window)
    expect(container).not.toHaveAttribute('data-editando')
    await vi.waitFor(() => {
      expect(screen.queryByTestId('fantasma-area')).toBeNull()
    })
    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      expect(chamadas.length).toBeGreaterThanOrEqual(2)
      expect(corpoDaConsulta(chamadas[chamadas.length - 1]).poligono.coordinates[0]).toEqual([
        [15, 15],
        [35, 15],
        [25, 25],
        [15, 15],
      ])
    })
  })
})
