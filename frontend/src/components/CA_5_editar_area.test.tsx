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

const mapaAtual = () => estadoMapa.instancias[estadoMapa.instancias.length - 1]

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// CA-5 (lapidação 4, item 5): áreas desenhadas viram editáveis no modo
// ARRASTAR — arrastar o interior move a área inteira e a alça move um
// vértice; enquanto o gesto dura, data-editando está no mapa.
describe('CA-5: edição de áreas desenhadas arrastando', () => {
  it('arrastar o interior move TODOS os vértices e re-dispara a consulta', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
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
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    // Alças na área ativa (3 vértices de triângulo).
    expect(screen.getByTestId('alca-0')).toBeInTheDocument()
    expect(screen.getByTestId('alca-2')).toBeInTheDocument()
    expect(container).not.toHaveAttribute('data-editando')

    // Mouses: mousedown no interior do triângulo ((18,12) está dentro).
    fireEvent.mouseDown(container, { clientX: 18, clientY: 12 })
    expect(container).toHaveAttribute('data-editando', 'true')
    expect(mapaAtual().dragPan.disable).toHaveBeenCalled()

    // Gesto pela JANELA: translação de (+5, +5) em todos os vértices.
    fireEvent.mouseMove(window, { clientX: 23, clientY: 17 })
    expect(container).toHaveAttribute('data-editando', 'true')

    fireEvent.mouseUp(window)
    expect(container).not.toHaveAttribute('data-editando')
    expect(mapaAtual().dragPan.enable).toHaveBeenCalled()

    const poligono = JSON.parse(container.getAttribute('data-poligono-desenhado') as string)
    expect(poligono.coordinates[0]).toEqual([
      [15, 15],
      [35, 15],
      [25, 25],
      [15, 15],
    ])

    // A mudança re-dispara a consulta com o polígono novo.
    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      expect(chamadas.length).toBeGreaterThanOrEqual(2)
      const corpo = JSON.parse(String(chamadas[chamadas.length - 1][1].body))
      expect(corpo.poligono.coordinates[0][0]).toEqual([15, 15])
    })
  })

  it('arrastar a alça-0 move SÓ o vértice escolhido e mantém área positiva', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
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
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    // Alça 0 está em ((10,10)): arrastar até ((12,19)) — o triângulo permanece
    // positivo ((guaiamum... a área antiga não colapsa com esse movimento)).
    fireEvent.mouseDown(screen.getByTestId('alca-0'))
    expect(container).toHaveAttribute('data-editando', 'true')
    expect(screen.getByTestId('alca-0')).toHaveAttribute('data-editando', 'true')

    fireEvent.mouseMove(window, { clientX: 12, clientY: 19 })
    fireEvent.mouseUp(window)

    const poligono = JSON.parse(container.getAttribute('data-poligono-desenhado') as string)
    expect(poligono.coordinates[0]).toEqual([
      [12, 19],
      [30, 10],
      [20, 20],
      [12, 19],
    ])
    expect(container).not.toHaveAttribute('data-editando')
  })

  it('clique fora de área continua neste modo sem pegar o ponteiro (data-editando ausente)', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
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
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    // (60,60) está fora do triângulo ((10..30, 10..20)) — sem edição.
    fireEvent.mouseDown(container, { clientX: 60, clientY: 60 })
    expect(container).not.toHaveAttribute('data-editando')
  })
})
