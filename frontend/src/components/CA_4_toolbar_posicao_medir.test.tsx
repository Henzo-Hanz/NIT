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

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-4: toolbar centralizada, móvel e com medidor de distância', () => {
  it('a toolbar nasce centralizada horizontalmente embaixo do header', () => {
    configurarFetch()
    render(<MapView />)

    const ferramentas = screen.getByTestId('ferramentas')
    expect(ferramentas.className).toContain('absolute')
    expect(ferramentas.className).toContain('left-1/2')
    expect(ferramentas.className).toContain('top-16')
    expect(ferramentas.className).toContain('-translate-x-1/2')
    expect(screen.getByTestId('ferramenta-grip')).toBeInTheDocument()
  })

  it('arrastar a barra move a toolbar para a nova posição', () => {
    configurarFetch()
    render(<MapView />)

    const ferramentas = screen.getByTestId('ferramentas')
    expect(ferramentas.style.left).toBe('')
    expect(ferramentas.style.top).toBe('')

    fireEvent.mouseDown(screen.getByTestId('ferramenta-grip'), { clientX: 100, clientY: 100 })
    fireEvent.mouseMove(ferramentas, { clientX: 160, clientY: 140 })

    expect(ferramentas.style.left).toBe('60px')
    expect(ferramentas.style.top).toBe('40px')
  })

  it('o clique nos botões não arrasta a barra', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    const ferramentas = screen.getByTestId('ferramentas')
    fireEvent.mouseDown(screen.getByTestId('ferramenta-desenhar'), { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(ferramentas, { clientX: 200, clientY: 200 })

    expect(ferramentas.style.left).toBe('')
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
  })

  it('a ferramenta de medir existe e alterna o estado ativo', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    const medir = screen.getByTestId('ferramenta-medir')
    expect(medir).toBeInTheDocument()
    expect(medir).toHaveAttribute('aria-label', 'Medir distância entre pontos')
    expect(medir).toHaveAttribute('aria-pressed', 'false')

    await usuario.click(medir)
    expect(medir).toHaveAttribute('aria-pressed', 'true')

    await usuario.click(screen.getByTestId('ferramenta-arrastar'))
    expect(medir).toHaveAttribute('aria-pressed', 'false')
  })
})
