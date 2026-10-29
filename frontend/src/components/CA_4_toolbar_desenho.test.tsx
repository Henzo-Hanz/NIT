import { afterEach, describe, expect, it, vi } from 'vitest'
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

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-4: toolbar de ferramentas sob o header, recolhível e com modos', () => {
  it('toolbar fica sob o header (top-16) e o botão de recolher esconde as ferramentas', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    const ferramentas = screen.getByTestId('ferramentas')
    expect(ferramentas.className).toContain('top-16')
    expect(screen.getByTestId('ferramenta-desenhar')).toBeInTheDocument()
    expect(screen.getByTestId('ferramenta-arrastar')).toBeInTheDocument()

    await usuario.click(screen.getByTestId('ferramenta-recolher'))
    expect(screen.queryByTestId('ferramenta-desenhar')).toBeNull()
    expect(screen.queryByTestId('ferramenta-arrastar')).toBeNull()
    expect(screen.getByTestId('ferramenta-recolher')).toBeInTheDocument()

    await usuario.click(screen.getByTestId('ferramenta-recolher'))
    expect(screen.getByTestId('ferramenta-desenhar')).toBeInTheDocument()
  })

  it('a lupa de pesquisar está habilitada e dispara a busca', async () => {
    const usuario = userEvent.setup()
    const aoPesquisar = vi.fn()
    configurarFetch()
    render(<MapView onPesquisar={aoPesquisar} />)

    const pesquisar = screen.getByTestId('ferramenta-pesquisar')
    expect(pesquisar).toBeInTheDocument()
    expect(pesquisar).not.toBeDisabled()
    await usuario.click(pesquisar)
    expect(aoPesquisar).toHaveBeenCalledTimes(1)
  })

  it('sem a prop de busca o clique na lupa não quebra o mapa', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-pesquisar'))
    expect(screen.getByTestId('mapa')).toBeInTheDocument()
  })

  it('alternar entre desenhar e arrastar marca o modo ativo, muda o cursor e o pan', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(instancia()).toBeTruthy()
    })

    expect(screen.getByTestId('ferramenta-arrastar')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('ferramenta-desenhar')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('mapa-container').className).not.toContain('cursor-crosshair')

    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    expect(screen.getByTestId('ferramenta-desenhar')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('ferramenta-arrastar')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('mapa-container').className).toContain('cursor-crosshair')
    await vi.waitFor(() => {
      expect(instancia().dragPan.disable).toHaveBeenCalled()
    })

    await usuario.click(screen.getByTestId('ferramenta-arrastar'))
    expect(screen.getByTestId('ferramenta-arrastar')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('ferramenta-desenhar')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('mapa-container').className).not.toContain('cursor-crosshair')
    await vi.waitFor(() => {
      expect(instancia().dragPan.enable).toHaveBeenCalled()
    })
  })
})
