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

const ESPECIES_AREA = [
  { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 2 },
  { slug: 'guaiamum', nome_popular: 'Guaiamum', contagem: 1 },
  { slug: 'badejo', nome_popular: 'Badejo', contagem: 1 },
]

const PONTOS = [
  {
    type: 'Feature',
    properties: {
      id: 1,
      nome: 'Jericoacoara',
      descricao: '2 espécies encontradas',
      especie_slugs: ['caranguejo-uca', 'guaiamum'],
      total: 2,
    },
    geometry: { type: 'Point', coordinates: [-40.513, -2.797] },
  },
  {
    type: 'Feature',
    properties: {
      id: 2,
      nome: 'Camocim',
      descricao: '1 espécie encontrada',
      especie_slugs: ['badejo'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [-40.84, -2.9] },
  },
]

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    if (String(entrada) === '/api/consulta/area/') {
      return {
        ok: true,
        json: async () => ({
          especies: ESPECIES_AREA,
          pontos: { type: 'FeatureCollection', features: PONTOS },
        }),
      }
    }
    return { ok: false, json: async () => ({}) }
  })
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

describe('CA-6: estado aplicado e pisca dos filtros', () => {
  it('a opção ativa ganha estado selecionado e o chip mostra o filtro', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    const todas = screen.getByTestId('filtro-todas')
    expect(todas).toHaveAttribute('aria-pressed', 'true')
    expect(todas).toHaveAttribute('data-ativo', 'true')
    expect(todas.className).toContain('bg-primary')
    expect(todas.className).toContain('text-primary-foreground')
    expect(screen.getByTestId('filtro-aplicado')).toHaveTextContent(
      'Filtrando por: Todas as espécies',
    )

    await usuario.click(screen.getByTestId('filtro-mais'))
    const mais = screen.getByTestId('filtro-mais')
    expect(mais).toHaveAttribute('aria-pressed', 'true')
    expect(mais).toHaveAttribute('data-ativo', 'true')
    expect(mais.className).toContain('bg-primary')
    expect(todas).toHaveAttribute('aria-pressed', 'false')
    expect(todas).toHaveAttribute('data-ativo', 'false')
    expect(todas.className).not.toContain('bg-primary')
    expect(screen.getByTestId('filtro-aplicado')).toHaveTextContent(
      'Filtrando por: Mais presente',
    )

    await usuario.click(screen.getByTestId('filtro-menos'))
    expect(screen.getByTestId('filtro-aplicado')).toHaveTextContent(
      'Filtrando por: Menos presente',
    )
    expect(screen.getByTestId('filtro-menos')).toHaveAttribute('data-ativo', 'true')
  })

  it('escolher espécie marca o item e o chip mostra o animal; animal específico usa o termo', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getByTestId('filtro-especie-guaiamum')).toBeInTheDocument()
    })

    await usuario.click(screen.getByTestId('filtro-especie-guaiamum'))
    const guaiamum = screen.getByTestId('filtro-especie-guaiamum')
    expect(guaiamum).toHaveAttribute('data-ativo', 'true')
    expect(guaiamum).toHaveAttribute('aria-pressed', 'true')
    expect(guaiamum.className).toContain('bg-accent')
    expect(screen.getByTestId('filtro-aplicado')).toHaveTextContent('Filtrando por: Guaiamum')

    await usuario.click(screen.getByTestId('filtro-especie-guaiamum'))
    expect(screen.getByTestId('filtro-especie-guaiamum')).toHaveAttribute('data-ativo', 'false')
    expect(screen.getByTestId('filtro-aplicado')).toHaveTextContent(
      'Filtrando por: Todas as espécies',
    )

    await usuario.click(screen.getByTestId('filtro-especifica'))
    await usuario.type(screen.getByTestId('filtro-animal'), 'Badejo')
    expect(screen.getByTestId('filtro-aplicado')).toHaveTextContent('Filtrando por: Badejo')
  })

  it('os pontos piscam ao clicar numa opção de filtro e assentam depois', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })

    await usuario.click(screen.getByTestId('filtro-mais'))
    for (const ponto of screen.getAllByTestId('ponto-area')) {
      expect(ponto).toHaveAttribute('data-pisca', 'filtro-mais')
      expect(ponto.className).toContain('ponto-pisca')
    }

    await vi.waitFor(
      () => {
        for (const ponto of screen.getAllByTestId('ponto-area')) {
          expect(ponto).not.toHaveAttribute('data-pisca')
          expect(ponto.className).not.toContain('ponto-pisca')
        }
      },
      { timeout: 2000 },
    )
  })

  it('clicar numa espécie da lista também pisca com o identificador dela', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })
    expect(
      screen
        .getAllByTestId('ponto-area')
        .every((ponto) => !ponto.hasAttribute('data-pisca')),
    ).toBe(true)

    await usuario.click(screen.getByTestId('filtro-especie-badejo'))
    for (const ponto of screen.getAllByTestId('ponto-area')) {
      expect(ponto).toHaveAttribute('data-pisca', 'filtro-especie-badejo')
      expect(ponto.className).toContain('ponto-pisca')
    }
    expect(
      fetchFake.mock.calls.filter((chamada) => String(chamada[0]).includes('busca')),
    ).toHaveLength(0)
  })
})
