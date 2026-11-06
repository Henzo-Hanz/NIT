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
    // Lapidação 4: no estado padrão (Todas as espécies) NÃO existe chip.
    expect(screen.queryByTestId('filtro-aplicado')).toBeNull()

    await usuario.click(screen.getByTestId('filtro-mais'))
    const mais = screen.getByTestId('filtro-mais')
    expect(mais).toHaveAttribute('aria-pressed', 'true')
    expect(mais).toHaveAttribute('data-ativo', 'true')
    expect(mais.className).toContain('bg-primary')
    expect(todas).toHaveAttribute('aria-pressed', 'false')
    expect(todas).toHaveAttribute('data-ativo', 'false')
    expect(todas.className).not.toMatch(/(^|\s)bg-primary(?=\s|$)/)
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
    // Voltou para o padrão: chip some.
    expect(screen.queryByTestId('filtro-aplicado')).toBeNull()

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

// Lapidação 11: o filtro determina TAMBÉM o CONTEÚDO do pin/bolha — sem
// excluir os outros animais dos PONTOS mantidos, cortando o que se exibe
// deles. Premissa registrada no MapView: 'específica' com texto usa os slugs
// que resultado.especies traz (server já filtrou); sem texto, sem restrição.
const ESPECIES_CONJUNTO = [
  { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 9 },
  { slug: 'guaiamum', nome_popular: 'Guaiamum', contagem: 8 },
  { slug: 'badejo', nome_popular: 'Badejo', contagem: 7 },
  { slug: 'sardinha-laje', nome_popular: 'Sardinha-laje', contagem: 6 },
]

const PONTO_MISTO = {
  type: 'Feature',
  properties: {
    id: 12,
    nome: 'Tamboril',
    descricao: '4 espécies encontradas',
    especie_slugs: ['caranguejo-uca', 'sardinha-laje', 'guaiamum', 'badejo'],
    total: 4,
  },
  geometry: { type: 'Point', coordinates: [-40.2, -2.6] },
}

function configurarFetchCortado(opcoes?: {
  busca?: unknown
  animal?: string | null
  especificaEspecies?: unknown[]
}) {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const rota = String(entrada)
    if (rota === '/api/consulta/area/') {
      const corpo = init?.body ? JSON.parse(String(init.body)) : {}
      if (corpo.animal && opcoes?.especificaEspecies) {
        return {
          ok: true,
          json: async () => ({
            especies: opcoes.especificaEspecies,
            pontos: { type: 'FeatureCollection', features: [PONTO_MISTO] },
          }),
        }
      }
      const lista = corpo.ordenar === 'menos' ? [...ESPECIES_CONJUNTO].reverse() : ESPECIES_CONJUNTO
      return {
        ok: true,
        json: async () => ({
          especies: lista,
          pontos: { type: 'FeatureCollection', features: [PONTO_MISTO] },
        }),
      }
    }
    if (opcoes?.busca && rota.startsWith('/api/consulta/busca/')) {
      return { ok: true, json: async () => opcoes.busca }
    }
    return { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

const ouvinteDoPonto = (nome: string) =>
  screen
    .getAllByTestId('ponto-area')
    .find((ponto) => ponto.getAttribute('aria-label') === nome)

const hrefsDoPin = (pin: HTMLElement) =>
  Array.from(pin.querySelectorAll('image[data-icono-phylopic]')).map((imagem) =>
    imagem.getAttribute('href'),
  )

describe('CA-6: filtro determina o conteúdo do pin/bolha do ponto mantido', () => {
  it('sem filtro o pin e a bolha mostram TODAS as espécies do ponto', async () => {
    const usuario = userEvent.setup()
    configurarFetchCortado()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(1)
    })

    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    expect(hrefsDoPin(screen.getByTestId('pin-area'))).toEqual([
      '/api/especies/caranguejo-uca/icone/',
      '/api/especies/sardinha-laje/icone/',
      '/api/especies/guaiamum/icone/',
      '/api/especies/badejo/icone/',
    ])

    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    const bolha = screen.getByTestId('bolha-area')
    expect(screen.getByTestId('bolha-contagem')).toHaveTextContent('4 espécies encontradas')
    for (const slug of ['caranguejo-uca', 'sardinha-laje', 'guaiamum', 'badejo']) {
      expect(screen.getByTestId(`area-especie-${slug}`)).toBeInTheDocument()
    }
    expect(bolha.querySelector('[data-testid="area-especie-sardinha-laje"]')).not.toBeNull()
  })

  it('filtro MAIS corta pin/bolha ao top-3: contagem e lista refletem o subconjunto', async () => {
    const usuario = userEvent.setup()
    configurarFetchCortado()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(1)
    })
    await usuario.click(screen.getByTestId('filtro-mais'))
    await vi.waitFor(() => {
      expect(screen.getByTestId('filtro-aplicado')).toHaveTextContent('Filtrando por: Mais presente')
    })
    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    // O ponto mantém [uca, sardinha, guaiamum, badejo] na ordem original; o
    // conjunto é [uca, guaiamum, badejo] (sardinha-laje fora do top-3).
    expect(hrefsDoPin(screen.getByTestId('pin-area'))).toEqual([
      '/api/especies/caranguejo-uca/icone/',
      '/api/especies/guaiamum/icone/',
      '/api/especies/badejo/icone/',
    ])

    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    expect(screen.getByTestId('bolha-contagem')).toHaveTextContent('3 espécies encontradas')
    expect(screen.getByTestId('area-especie-caranguejo-uca')).toBeInTheDocument()
    expect(screen.getByTestId('area-especie-guaiamum')).toBeInTheDocument()
    expect(screen.getByTestId('area-especie-badejo')).toBeInTheDocument()
    expect(screen.queryByTestId('area-especie-sardinha-laje')).toBeNull()
  })

  it('filtro MENOS corta ao top-3 da lista asc e o pin segue a ordem do ponto', async () => {
    const usuario = userEvent.setup()
    configurarFetchCortado()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(1)
    })
    await usuario.click(screen.getByTestId('filtro-menos'))
    await vi.waitFor(() => {
      expect(screen.getByTestId('filtro-menos')).toHaveAttribute('data-ativo', 'true')
    })
    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    // menos asc = [sardinha-laje, badejo, guaiamum, uca] → top-3 sardinha/
    // badejo/guaiamum; na ordem do ponto sobra [sardinha, guaiamum, badejo].
    expect(hrefsDoPin(screen.getByTestId('pin-area'))).toEqual([
      '/api/especies/sardinha-laje/icone/',
      '/api/especies/guaiamum/icone/',
      '/api/especies/badejo/icone/',
    ])
    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    expect(screen.getByTestId('bolha-contagem')).toHaveTextContent('3 espécies encontradas')
    expect(screen.queryByTestId('area-especie-caranguejo-uca')).toBeNull()
    expect(screen.getByTestId('area-especie-sardinha-laje')).toBeInTheDocument()
  })

  it('espécie clicada deixa só ela no pin e na bolha do ponto mantido', async () => {
    const usuario = userEvent.setup()
    configurarFetchCortado()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getByTestId('filtro-especie-guaiamum')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('filtro-especie-guaiamum'))
    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    expect(hrefsDoPin(screen.getByTestId('pin-area'))).toEqual([
      '/api/especies/guaiamum/icone/',
    ])

    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    expect(screen.getByTestId('bolha-contagem')).toHaveTextContent('1 espécie encontrada')
    expect(screen.getByTestId('area-especie-guaiamum')).toBeInTheDocument()
    expect(screen.queryByTestId('area-especie-caranguejo-uca')).toBeNull()
    expect(screen.queryByTestId('area-especie-sardinha-laje')).toBeNull()
    expect(screen.queryByTestId('area-especie-badejo')).toBeNull()
  })

  it('mudança de filtro redesenha o pin do ponto ativo e a bolha aberta segue', async () => {
    const usuario = userEvent.setup()
    configurarFetchCortado()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(1)
    })
    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    expect(screen.getByTestId('bolha-contagem')).toHaveTextContent('4 espécies encontradas')

    await usuario.click(screen.getByTestId('filtro-mais'))
    // O pin velho sai em fade (elemento próprio, 250ms): o NOVO pin é o que
    // já nasce com 3 imagens. A bolha aberta permanece, agora do subconjunto.
    await vi.waitFor(() => {
      const pinNovo = screen
        .getAllByTestId('pin-area')
        .find((pin) => hrefsDoPin(pin).length === 3)
      expect(pinNovo).toBeDefined()
      expect(hrefsDoPin(pinNovo!)).toEqual([
        '/api/especies/caranguejo-uca/icone/',
        '/api/especies/guaiamum/icone/',
        '/api/especies/badejo/icone/',
      ])
    })
    await vi.waitFor(() => {
      expect(screen.getByTestId('bolha-contagem')).toHaveTextContent('3 espécies encontradas')
    })
    expect(screen.queryByTestId('area-especie-sardinha-laje')).toBeNull()
  })

  it('específica com texto corta ao que resultado.especies traz (server filtrou)', async () => {
    const usuario = userEvent.setup()
    configurarFetchCortado({
      especificaEspecies: [
        { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 9 },
      ],
    })
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(1)
    })
    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    expect(hrefsDoPin(screen.getByTestId('pin-area'))).toHaveLength(4)

    await usuario.click(screen.getByTestId('filtro-especifica'))
    await usuario.type(screen.getByTestId('filtro-animal'), 'Caranguejo')
    // animalAplicado dispara nova consulta com o termo; o resultado (mock
    // já filtrado pelo server) traz só uca — e o pin do ponto ativo é
    // REDOGADO ao subconjunto sem fechar nada além do necessário.
    await vi.waitFor(() => {
      const pinNovo = screen
        .getAllByTestId('pin-area')
        .find((pin) => hrefsDoPin(pin).length === 1)
      expect(pinNovo).toBeDefined()
      expect(hrefsDoPin(pinNovo!)).toEqual(['/api/especies/caranguejo-uca/icone/'])
    })

    await usuario.click(screen.getAllByTestId('ponto-area')[0])
    expect(screen.getByTestId('bolha-contagem')).toHaveTextContent('1 espécie encontrada')
    expect(screen.queryByTestId('area-especie-sardinha-laje')).toBeNull()
    expect(screen.queryByTestId('area-especie-guaiamum')).toBeNull()
    expect(screen.queryByTestId('area-especie-badejo')).toBeNull()
  })

  it('overlay da busca segue o conjunto: ponto fora não renderiza, o mantido corta o pin', async () => {
    const usuario = userEvent.setup()
    configurarFetchCortado({
      busca: {
        especies: [{ slug: 'guaiamum', nome_popular: 'Guaiamum' }],
        pontos: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                id: 30,
                nome: 'Ilha do Mato',
                descricao: '2 espécies encontradas',
                especie_slugs: ['guaiamum', 'sardinha-laje'],
                total: 2,
                busca_slugs: ['guaiamum'],
              },
              geometry: { type: 'Point', coordinates: [-40.4, -2.7] },
            },
            {
              type: 'Feature',
              properties: {
                id: 31,
                nome: 'Fora do Conjunto',
                descricao: '1 espécie encontrada',
                especie_slugs: ['sardinha-laje'],
                total: 1,
                busca_slugs: ['sardinha-laje'],
              },
              geometry: { type: 'Point', coordinates: [-40.1, -2.8] },
            },
          ],
        },
      },
    })
    render(<MapView />)
    await usuario.click(screen.getByTestId('filtro-mais'))
    await usuario.click(screen.getByTestId('ferramenta-pesquisar'))
    await usuario.type(screen.getByTestId('campo-busca'), 'guaiamum')
    await vi.waitFor(() => {
      expect(ouvinteDoPonto('Ilha do Mato')).toBeDefined()
      expect(ouvinteDoPonto('Fora do Conjunto')).toBeUndefined()
    })

    await usuario.click(ouvinteDoPonto('Ilha do Mato')!)
    expect(hrefsDoPin(screen.getByTestId('pin-area'))).toEqual([
      '/api/especies/guaiamum/icone/',
    ])
  })
})
