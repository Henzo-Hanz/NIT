import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    fonte = { setData: vi.fn(), setTiles: vi.fn() }
    zoomIn = vi.fn()
    zoomOut = vi.fn()
    easeTo = vi.fn()
    addSource = vi.fn()
    addLayer = vi.fn()
    setLayoutProperty = vi.fn()
    project = vi.fn((coordenadas: [number, number]) => ({
      x: coordenadas[0] * 10,
      y: coordenadas[1] * 10,
    }))
    unproject = vi.fn(([x, y]: [number, number]) => [x, y])
    getSource = vi.fn(() => this.fonte)
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

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-5: submenu do medidor com absoluta, rota e voltar', () => {
  it('abre no clique em Medir e marca a opção escolhida com data-ativo e aria-pressed', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    const submenu = screen.getByTestId('ferramentas-medida')
    expect(submenu).toHaveAttribute('data-aberto', 'false')

    await usuario.click(screen.getByTestId('ferramenta-medir'))
    expect(submenu).toHaveAttribute('data-aberto', 'true')
    expect(submenu).toHaveAttribute('aria-hidden', 'false')
    expect(screen.getByTestId('medida-absoluta')).toBeInTheDocument()
    expect(screen.getByTestId('medida-rota')).toBeInTheDocument()
    expect(screen.getByTestId('medida-voltar')).toBeInTheDocument()
    expect(screen.getByTestId('ferramenta-medir')).toHaveAttribute('aria-pressed', 'true')

    await usuario.click(screen.getByTestId('medida-rota'))
    expect(submenu).toHaveAttribute('data-aberto', 'false')
    expect(screen.getByTestId('medida-rota')).toHaveAttribute('data-ativo', 'true')
    expect(screen.getByTestId('medida-rota')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('medida-absoluta')).toHaveAttribute('aria-pressed', 'false')

    await usuario.click(screen.getByTestId('ferramenta-medir'))
    await usuario.click(screen.getByTestId('medida-absoluta'))
    expect(screen.getByTestId('medida-absoluta')).toHaveAttribute('data-ativo', 'true')
    expect(screen.getByTestId('medida-absoluta')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('medida-rota')).toHaveAttribute('aria-pressed', 'false')

    await usuario.click(screen.getByTestId('ferramenta-medir'))
    await usuario.click(screen.getByTestId('medida-voltar'))
    expect(submenu).toHaveAttribute('data-aberto', 'false')
  })
})
