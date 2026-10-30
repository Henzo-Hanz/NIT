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

const ESPECIES_AREA = [
  { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 2 },
  { slug: 'guaiamum', nome_popular: 'Guaiamum', contagem: 1 },
  { slug: 'caranguejo-maria-farinha', nome_popular: 'Caranguejo maria-farinha', contagem: 1 },
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
      especie_slugs: ['caranguejo-maria-farinha'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [-40.84, -2.9] },
  },
]

function responderConsulta(corpo: any) {
  let especies = [...ESPECIES_AREA]
  let pontos = [...PONTOS]
  if (corpo.animal) {
    const termo = String(corpo.animal).toLowerCase()
    especies = especies.filter((item) => item.nome_popular.toLowerCase().includes(termo))
    pontos = pontos.filter((ponto) =>
      ponto.properties.especie_slugs.some((slug) =>
        especies.some((especie) => especie.slug === slug),
      ),
    )
  }
  if (corpo.ordenar === 'mais') {
    especies = [...especies].sort((a, b) => b.contagem - a.contagem)
  }
  if (corpo.ordenar === 'menos') {
    especies = [...especies].sort((a, b) => a.contagem - b.contagem)
  }
  return { especies, pontos: { type: 'FeatureCollection', features: pontos } }
}

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const rota = String(entrada)
    if (rota === '/api/consulta/area/') {
      const corpo = init?.body ? JSON.parse(String(init.body)) : {}
      return { ok: true, json: async () => responderConsulta(corpo) }
    }
    return { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

const consultas = (fetchFake: ReturnType<typeof vi.fn>) =>
  fetchFake.mock.calls.filter((chamada: any[]) => chamada[0] === '/api/consulta/area/')

const corpoDaConsulta = (chamada: any[]) => JSON.parse(String(chamada[1].body))

async function desenhar(container: HTMLElement) {
  fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
  fireEvent.mouseMove(container, { clientX: 20, clientY: 20 })
  fireEvent.mouseMove(container, { clientX: 30, clientY: 10 })
  fireEvent.mouseUp(container)
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-6: painel de filtros no lugar do de camadas', () => {
  it('as quatro opções de filtro existem', () => {
    configurarFetch()
    render(<MapView />)
    expect(screen.getByTestId('filtro-todas')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('filtro-mais')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('filtro-menos')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('filtro-especifica')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('filtro-todas')).toHaveTextContent('Todas as espécies')
    expect(screen.getByTestId('filtro-mais')).toHaveTextContent('Mais presente')
    expect(screen.getByTestId('filtro-menos')).toHaveTextContent('Menos presente')
    expect(screen.getByTestId('filtro-especifica')).toHaveTextContent('Animal específico')
  })

  it('sem polígono a consulta usa o escopo Brasil', async () => {
    const fetchFake = configurarFetch()
    render(<MapView />)

    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      expect(chamadas.length).toBeGreaterThan(0)
      expect(corpoDaConsulta(chamadas[chamadas.length - 1]).poligono).toBeNull()
    })
    expect(screen.getByTestId('filtro-escopo')).toHaveTextContent('todo o Brasil')
  })

  it('com polígono a consulta usa o escopo da área desenhada', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await desenhar(screen.getByTestId('mapa-container'))

    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      const ultima = chamadas[chamadas.length - 1]
      expect(corpoDaConsulta(ultima).poligono).not.toBeNull()
    })
    expect(screen.getByTestId('filtro-escopo')).toHaveTextContent('área desenhada')
  })

  it('as opções mais presente e menos presente ordenam a consulta', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    render(<MapView />)

    await usuario.click(screen.getByTestId('filtro-mais'))
    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      expect(corpoDaConsulta(chamadas[chamadas.length - 1]).ordenar).toBe('mais')
    })

    await usuario.click(screen.getByTestId('filtro-menos'))
    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      expect(corpoDaConsulta(chamadas[chamadas.length - 1]).ordenar).toBe('menos')
    })
  })

  it('animal específico busca pelo nome aproximado digitado', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    render(<MapView />)

    await usuario.click(screen.getByTestId('filtro-especifica'))
    const campo = screen.getByTestId('filtro-animal')
    expect(campo).toHaveAttribute('placeholder', 'Nome do animal')
    await usuario.type(campo, 'maria')

    await vi.waitFor(
      () => {
        const chamadas = consultas(fetchFake)
        expect(corpoDaConsulta(chamadas[chamadas.length - 1]).animal).toBe('maria')
      },
      { timeout: 3000 },
    )
  })

  it('a lista mostra as espécies com a contagem', async () => {
    configurarFetch()
    render(<MapView />)
    const item = await screen.findByTestId('filtro-especie-caranguejo-uca')
    expect(item).toHaveTextContent('Caranguejo-uçá (2)')
    expect(screen.getByTestId('filtro-especie-guaiamum')).toHaveTextContent('Guaiamum (1)')
  })

  it('destaca os pontos da espécie mantendo todos visíveis', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await desenhar(screen.getByTestId('mapa-container'))

    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })
    for (const ponto of screen.getAllByTestId('ponto-area')) {
      expect(ponto).not.toHaveAttribute('data-destacado')
      expect(ponto.className).toContain('size-4')
      expect(ponto.className).toContain('bg-teal-600')
    }

    await usuario.click(screen.getByTestId('filtro-especie-guaiamum'))
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })

    const pontos = screen.getAllByTestId('ponto-area')
    const destacado = pontos.find((ponto) => ponto.getAttribute('aria-label') === 'Jericoacoara')
    const apagado = pontos.find((ponto) => ponto.getAttribute('aria-label') === 'Camocim')
    expect(destacado).toHaveAttribute('data-destacado', 'true')
    expect(destacado?.className).toContain('size-6')
    expect(destacado?.className).toContain('bg-amber-500')
    expect(destacado?.className).toContain('ring-4')
    expect(destacado?.className).toContain('ring-amber-400')
    expect(destacado?.className).toContain('z-20')
    expect(apagado).toHaveAttribute('data-destacado', 'false')
    expect(apagado?.className).toContain('size-3')
    expect(apagado?.className).toContain('opacity-40')
  })
})
