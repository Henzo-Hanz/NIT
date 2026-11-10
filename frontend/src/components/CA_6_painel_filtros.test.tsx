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

    // PREMISSA (lapidação 5): o texto do campo já filtra server-side (CA-3) — os
    // pontos sem o animal saem do escopo da consulta. Com a regra da lapidação 5
    // (não-casado não muda de tamanho), o resultado fica evidente: só o ponto com
    // o animal permanece, no tamanho normal, sem destaque nem esmaecimento.
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(1)
    })
    const ponto = screen.getAllByTestId('ponto-area')[0]
    expect(ponto).toHaveAttribute('aria-label', 'Camocim')
    expect(ponto).not.toHaveAttribute('data-destacado')
    expect(ponto.className).toContain('size-4')
    expect(ponto.className).toContain('bg-teal-600')
    expect(ponto.className).not.toContain('size-3')
    expect(ponto.className).not.toContain('opacity-40')
  })

  it('hover por tema: opções do painel usam muted no claro e primário leve no escuro', async () => {
    configurarFetch()
    render(<MapView />)
    await screen.findByTestId('filtro-especie-caranguejo-uca')

    // Lapidação 5: duplicar claro/escuro — claro volta ao muted (como antes da
    // lapidação 4); escuro sobe no primary/60.
    for (const botao of [
      screen.getByTestId('filtro-mais'),
      screen.getByTestId('recolher-filtros'),
      screen.getByTestId('filtro-especie-caranguejo-uca'),
    ]) {
      expect(botao.className).toContain('hover:bg-muted')
      expect(botao.className).toContain('hover:text-foreground')
      expect(botao.className).toContain('dark:hover:bg-primary/60')
      expect(botao.className).toContain('dark:hover:text-primary-foreground')
      expect(botao.className).not.toMatch(/(^|\s)hover:bg-primary\/60(?=\s|$)/)
    }
    const ativo = screen.getByTestId('filtro-todas')
    expect(ativo.className).toContain('bg-primary')
    expect(ativo.className).toContain('hover:bg-primary/90')
    expect(ativo.className).toContain('dark:hover:bg-primary/90')

    // Ativa de espécie segue com accent (mantém o padrão existente).
    const usuario = userEvent.setup()
    await usuario.click(screen.getByTestId('filtro-especie-caranguejo-uca'))
    const especieAtiva = screen.getByTestId('filtro-especie-caranguejo-uca')
    expect(especieAtiva.className).toContain('bg-accent')
    expect(especieAtiva.className).toContain('hover:bg-accent/90')
  })

  it('a lista mostra as espécies com a contagem', async () => {
    configurarFetch()
    render(<MapView />)
    // Lapidação 4: nome à esquerda e contagem alinhada à direita (sem parênteses).
    const item = await screen.findByTestId('filtro-especie-caranguejo-uca')
    expect(item).toHaveTextContent('Caranguejo-uçá')
    expect(item).toHaveTextContent('2')
    expect(screen.getByTestId('filtro-especie-guaiamum')).toHaveTextContent('Guaiamum')
    expect(screen.getByTestId('filtro-especie-guaiamum')).toHaveTextContent('1')
  })

  it('clicar na espécie FILTRA os pontos aos dela, mantendo o destaque amber', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await desenhar(screen.getByTestId('mapa-container'))

    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })

    // Lapidação 11: a espécie clicada agora DETERMINA os pontos renderizados —
    // só quem contém o slug permanece na DOM.
    await usuario.click(screen.getByTestId('filtro-especie-guaiamum'))
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(1)
    })

    const destacado = screen.getAllByTestId('ponto-area')[0]
    expect(destacado.getAttribute('aria-label')).toBe('Jericoacoara')
    expect(destacado).toHaveAttribute('data-destacado', 'true')
    expect(destacado.className).toContain('size-6')
    expect(destacado.className).toContain('bg-amber-500')
    expect(destacado.className).toContain('ring-4')
    expect(destacado.className).toContain('ring-amber-400')
    expect(destacado.className).toContain('z-20')

    // Deselecionar volta todos ao escopo (todas as espécies = sem restrição).
    await usuario.click(screen.getByTestId('filtro-especie-guaiamum'))
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })
    for (const ponto of screen.getAllByTestId('ponto-area')) {
      expect(ponto).not.toHaveAttribute('data-destacado')
      expect(ponto.className).toContain('bg-teal-600')
    }
  })
})

// FIXTURES da lapidação 11: consulta com pontos ALÉM do top-3/bottom-3 —
// contagens distintas e 6 espécies (top-3 e bottom-3 sem sobreposição).
const ESPECIES_AMPLIAS = [
  { slug: 'siri-azul', nome_popular: 'Siri-azul', contagem: 6 },
  { slug: 'aratu-vermelho', nome_popular: 'Aratu-vermelho', contagem: 5 },
  { slug: 'pescada-amarela', nome_popular: 'Pescada-amarela', contagem: 3 },
  { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 2 },
  { slug: 'caranguejo-maria-farinha', nome_popular: 'Caranguejo maria-farinha', contagem: 1 },
  { slug: 'guaiamum', nome_popular: 'Guaiamum', contagem: 1 },
]

const PONTOS_AMPLIOS = [
  {
    type: 'Feature',
    properties: {
      id: 1,
      nome: 'Jericoacoara',
      descricao: '1 espécie encontrada',
      especie_slugs: ['siri-azul'],
      total: 1,
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
  {
    type: 'Feature',
    properties: {
      id: 3,
      nome: 'Parnaíba',
      descricao: '1 espécie encontrada',
      especie_slugs: ['pescada-amarela'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [-41.77, -2.9] },
  },
  {
    type: 'Feature',
    properties: {
      id: 4,
      nome: 'Luís Correia',
      descricao: '1 espécie encontrada',
      especie_slugs: ['guaiamum'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [-41.71, -2.88] },
  },
]

function configurarFetchAmplio() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    if (String(entrada) === '/api/consulta/area/') {
      const corpo = init?.body ? JSON.parse(String(init.body)) : {}
      return { ok: true, json: async () => responderConsultaAmplia(corpo) }
    }
    return { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

// Duo: resultado com MENOS de 3 espécies — o filtro então usa todas.
const ESPECIES_DUO = [
  { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 2 },
  { slug: 'guaiamum', nome_popular: 'Guaiamum', contagem: 1 },
]

const PONTOS_DUO = [
  {
    type: 'Feature',
    properties: {
      id: 1,
      nome: 'Jericoacoara',
      descricao: '1 espécie encontrada',
      especie_slugs: ['caranguejo-uca'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [-40.513, -2.797] },
  },
  {
    type: 'Feature',
    properties: {
      id: 2,
      nome: 'Camocim',
      descricao: '1 espécie encontrada',
      especie_slugs: ['guaiamum'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [-40.84, -2.9] },
  },
]

function configurarFetchDuo() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    if (String(entrada) === '/api/consulta/area/') {
      const corpo = init?.body ? JSON.parse(String(init.body)) : {}
      const especies = [...ESPECIES_DUO].sort((a, b) =>
        corpo.ordenar === 'mais'
          ? b.contagem - a.contagem
          : a.contagem - b.contagem || a.nome_popular.localeCompare(b.nome_popular),
      )
      return { ok: true, json: async () => ({ especies, pontos: { type: 'FeatureCollection', features: PONTOS_DUO } }) }
    }
    return { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

function responderConsultaAmplia(corpo: any) {
  let especies = [...ESPECIES_AMPLIAS]
  let pontos = [...PONTOS_AMPLIOS]
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
    especies = [...especies].sort(
      (a, b) => a.contagem - b.contagem || a.nome_popular.localeCompare(b.nome_popular),
    )
  }
  return { especies, pontos: { type: 'FeatureCollection', features: pontos } }
}

describe('CA-6 lapidação 11: o filtro determina o conjunto de pontos renderizados', () => {
  it("'Mais presente' reduz os pontos aos das 3 espécies de maior contagem", async () => {
    const usuario = userEvent.setup()
    configurarFetchAmplio()
    render(<MapView />)
    // Todas primeiro: os 4 pontos do escopo estão presentes.
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(4)
    })

    await usuario.click(screen.getByTestId('filtro-mais'))
    // Top-3 por contagem: siri-azul (6), aratu-vermelho (5), pescada-amarela (3).
    // Ponto de siri (Jericoacoara) e de pescada (Parnaíba) PERMANECEM; os de
    // maria-farinha (Camocim) e guaiamum (Luís Correia) SOMEM.
    await vi.waitFor(() => {
      const nomes = screen
        .getAllByTestId('ponto-area')
        .map((ponto) => ponto.getAttribute('aria-label'))
      expect(nomes.sort()).toEqual(['Jericoacoara', 'Parnaíba'])
    })
  })

  it("'Menos presente' reduz os pontos aos das 3 espécies de menor contagem (lista asc. invertida pelo server)", async () => {
    const usuario = userEvent.setup()
    configurarFetchAmplio()
    render(<MapView />)

    await usuario.click(screen.getByTestId('filtro-menos'))
    // Bottom-3 do server asc: maria-farinha (1), guaiamum (1), uca (2).
    // Permanecem Camocim e Luís Correia; siri (Jericoacoara) e pescada
    // (Parnaíba) SOMEM — estão fora do bottom-3.
    await vi.waitFor(() => {
      const nomes = screen
        .getAllByTestId('ponto-area')
        .map((ponto) => ponto.getAttribute('aria-label'))
      expect(nomes.sort()).toEqual(['Camocim', 'Luís Correia'])
    })
  })

  it('com MENOS de 3 espécies no resultado, o filtro usa todas', async () => {
    const usuario = userEvent.setup()
    configurarFetchDuo()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })

    await usuario.click(screen.getByTestId('filtro-mais'))
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })

    await usuario.click(screen.getByTestId('filtro-menos'))
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })
    for (const ponto of screen.getAllByTestId('ponto-area')) {
      expect(ponto.className).toContain('bg-teal-600')
    }
  })
})
