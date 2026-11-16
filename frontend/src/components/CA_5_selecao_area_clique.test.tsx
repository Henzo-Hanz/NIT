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

// Clique completo no mapa: mousedown (captura/seleção), mouseup (fim do gesto)
// e click (handler de clique livre).
const clicar = (container: HTMLElement, x: number, y: number) => {
  fireEvent.mouseDown(container, { clientX: x, clientY: y })
  fireEvent.mouseUp(window)
  fireEvent.click(container, { clientX: x, clientY: y })
}

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
  await usuario.click(screen.getByTestId('ferramenta-arrastar'))
  return container
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// CA-5: no modo arrastar, clique no interior seleciona SEM alternar; clique
// fora desmarca; clique sem movimento não muda geometria nem historiza.
describe('CA-5: seleção de área por clique no mapa', () => {
  it('clique no interior seleciona e um novo clique mantém selecionada (sem alternar)', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    const container = await desenharTriangulo(usuario)
    const item = screen.getByTestId('area-item-1')
    expect(item).toHaveAttribute('data-selecionada', 'false')

    // (18,12) está dentro do triângulo desenhado.
    clicar(container, 18, 12)
    expect(item).toHaveAttribute('data-selecionada', 'true')
    expect(screen.getByTestId('alcas-area')).toHaveAttribute('data-selecionada', 'true')

    clicar(container, 18, 12)
    expect(item).toHaveAttribute('data-selecionada', 'true')

    // Clique fora de qualquer área desmarca.
    clicar(container, 60, 60)
    expect(item).toHaveAttribute('data-selecionada', 'false')
  })

  it('clique sem movimento não altera a geometria nem grava histórico', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    const container = await desenharTriangulo(usuario)
    const antes = container.getAttribute('data-poligono-desenhado')

    clicar(container, 18, 12)
    expect(container).not.toHaveAttribute('data-editando')
    expect(container.getAttribute('data-poligono-desenhado')).toBe(antes)
    expect(screen.getByTestId('area-item-1')).toHaveAttribute('data-selecionada', 'true')

    // Sem entrada de histórico do clique, o undo volta ao estado anterior ao
    // desenho (área removida).
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await vi.waitFor(() => {
      expect(screen.queryByTestId('area-item-1')).toBeNull()
    })
  })

  it('arrastar pelo interior continua movendo a área', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    const container = await desenharTriangulo(usuario)

    fireEvent.mouseDown(container, { clientX: 18, clientY: 12 })
    expect(container).toHaveAttribute('data-editando', 'true')
    fireEvent.mouseMove(window, { clientX: 23, clientY: 17 })
    fireEvent.mouseUp(window)

    expect(screen.getByTestId('area-item-1')).toHaveAttribute('data-selecionada', 'true')
    await vi.waitFor(() => {
      expect(poligonoExibido(container).coordinates[0]).toEqual([
        [15, 15],
        [35, 15],
        [25, 25],
        [15, 15],
      ])
    })
  })
})
