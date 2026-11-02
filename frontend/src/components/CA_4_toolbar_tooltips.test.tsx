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

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-4: tooltips (hover) e estado de hover da toolbar', () => {
  it('cada botão principal tem tooltip com o nome e aria-label', () => {
    configurarFetch()
    render(<MapView />)
    const rotulos: [string, string][] = [
      ['ferramenta-recolher', 'Recolher'],
      ['ferramenta-desenhar', 'Desenhar'],
      ['ferramenta-arrastar', 'Arrastar'],
      ['ferramenta-medir', 'Medir'],
      ['ferramenta-pesquisar', 'Pesquisar'],
    ]
    for (const [testid, nome] of rotulos) {
      const botao = screen.getByTestId(testid)
      expect(botao).toHaveAttribute('title', nome)
      expect(botao.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it('botão inativo tem classe de hover distinta e o ativo mantém a primária', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    const arrastar = screen.getByTestId('ferramenta-arrastar')
    const medir = screen.getByTestId('ferramenta-medir')
    expect(arrastar).toHaveAttribute('data-ativo', 'true')
    expect(arrastar.className).toContain('bg-primary')
    expect(arrastar.className).toContain('text-primary-foreground')
    expect(medir.className).toContain('hover:bg-muted')
    expect(medir.className).toContain('hover:text-foreground')
    expect(medir.className).toContain('hover:ring-1')
    expect(medir.className).toContain('hover:ring-border')
    expect(medir.className).toContain('transition-colors')
    expect(medir.className).not.toContain('bg-primary')

    await usuario.click(medir)
    expect(medir).toHaveAttribute('data-ativo', 'true')
    expect(medir.className).toContain('bg-primary')
    expect(medir.className).toContain('hover:bg-primary/90')
    expect(medir.className).not.toMatch(/(^|\s)hover:bg-muted(?=\s|$)/)
    expect(arrastar).toHaveAttribute('data-ativo', 'false')
    expect(arrastar.className).toMatch(/(^|\s)hover:bg-muted(?=\s|$)/)
    expect(arrastar.className).toContain('hover:ring-border')
  })

  it('os botões do submenu de desenho também têm tooltip e classe de hover', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    const ativos = new Map<string, string>([
      ['desenho-quadrado', 'Quadrado'],
      ['desenho-circulo', 'Círculo'],
      ['desenho-livre', 'Livre'],
    ])
    for (const [testid, nome] of ativos) {
      const botao = screen.getByTestId(testid)
      expect(botao).toHaveAttribute('title', nome)
    }
    expect(screen.getByTestId('desenho-voltar')).toHaveAttribute('title', 'Voltar')
    expect(screen.getByTestId('desenho-voltar').className).toContain('hover:bg-muted')
    const quadrado = screen.getByTestId('desenho-quadrado')
    expect(quadrado).toHaveAttribute('data-ativo', 'false')
    expect(quadrado.className).toContain('hover:bg-muted')
    expect(quadrado.className).toContain('hover:ring-border')

    await usuario.click(quadrado)
    expect(screen.getByTestId('desenho-quadrado')).toHaveAttribute('data-ativo', 'true')
    expect(screen.getByTestId('desenho-quadrado').className).toContain('bg-primary')
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    expect(screen.getByTestId('desenho-circulo').className).toContain('hover:bg-muted')
    expect(screen.getByTestId('desenho-livre').className).toContain('hover:bg-muted')
  })

  it('o submenu de busca tem voltar com tooltip e o campo nasce em foco', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    await usuario.click(screen.getByTestId('ferramenta-pesquisar'))
    const voltar = screen.getByTestId('busca-voltar')
    expect(voltar).toHaveAttribute('title', 'Voltar')
    expect(voltar).toHaveAttribute('aria-label', 'Voltar para as ferramentas')
    expect(voltar.className).toContain('hover:bg-muted')
    expect(voltar.className).toContain('hover:ring-border')
    expect(document.activeElement).toBe(screen.getByTestId('campo-busca'))
    expect(screen.getByTestId('ferramenta-pesquisar')).toHaveAttribute('title', 'Pesquisar')
  })
})
