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

// CA-7: desmarcar remove TODAS as affordances de edição (alças e rotação),
// sem fallback para a última área; o rótulo de tamanho segue visível, mas não
// captura mouse (pointer-events-none). A área pode ser re-selecionada.
describe('CA-7: desmarcar não deixa resíduo de alças', () => {
  it('clique fora remove alças/rotação sem alterar geometria e re-clique volta a mostrar', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    const container = await desenharTriangulo(usuario)
    const geometriaAntes = container.getAttribute('data-poligono-desenhado')

    // Seleciona pelo mapa (interior do triângulo).
    clicar(container, 18, 12)
    expect(screen.getByTestId('alcas-area')).toBeInTheDocument()
    expect(screen.getByTestId('alca-0')).toBeInTheDocument()
    expect(screen.getByTestId('alca-rotacao')).toBeInTheDocument()

    // Clique fora de qualquer área desmarca e derruba TODAS as affordances.
    clicar(container, 60, 60)
    expect(screen.getByTestId('area-item-1')).toHaveAttribute('data-selecionada', 'false')
    expect(screen.queryByTestId('alcas-area')).toBeNull()
    expect(screen.queryByTestId('alca-0')).toBeNull()
    expect(screen.queryByTestId('alca-rotacao')).toBeNull()
    expect(screen.queryByTestId('linha-rotacao')).toBeNull()

    // Geometria e consulta não mudam; o rótulo segue visível e inerte.
    expect(container.getAttribute('data-poligono-desenhado')).toBe(geometriaAntes)
    const rotulo = screen.getByTestId('area-tamanho')
    expect(rotulo).toBeInTheDocument()
    expect(rotulo).toHaveClass('pointer-events-none')

    // Re-clicar no interior re-seleciona e as alças voltam.
    clicar(container, 18, 12)
    expect(screen.getByTestId('area-item-1')).toHaveAttribute('data-selecionada', 'true')
    expect(screen.getByTestId('alcas-area')).toBeInTheDocument()
    expect(screen.getByTestId('alca-0')).toBeInTheDocument()
  })
})