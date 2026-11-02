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

const ESPECIES_ESCOPO = [
  { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 2 },
  { slug: 'guaiamum', nome_popular: 'Guaiamum', contagem: 1 },
]

const PONTOS_ESCOPO = [
  {
    type: 'Feature',
    properties: {
      id: 1,
      nome: 'Parnaíba',
      descricao: '2 espécies encontradas',
      especie_slugs: ['caranguejo-uca'],
      total: 2,
    },
    geometry: { type: 'Point', coordinates: [-41.7767, -2.9035] },
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

const ESPECIES_BUSCA = [
  { slug: 'badejo', nome_popular: 'Badejo' },
  { slug: 'garoupa', nome_popular: 'Garoupa' },
  { slug: 'pescada-amarela', nome_popular: 'Pescada-amarela' },
  { slug: 'guaiamum', nome_popular: 'Guaiamum' },
  { slug: 'sardinha-laje', nome_popular: 'Sardinha-laje' },
]

const PONTO_BUSCA = {
  type: 'Feature',
  properties: {
    id: 10,
    nome: 'Fernando de Noronha',
    descricao: '1 espécie encontrada',
    especie_slugs: ['badejo'],
    total: 1,
    busca_slugs: ['badejo'],
  },
  geometry: { type: 'Point', coordinates: [-32.25, -3.85] },
}

const BUSCA_VAZIA = { especies: [], pontos: { type: 'FeatureCollection', features: [] } }

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    const rota = String(entrada)
    if (rota === '/api/consulta/area/') {
      return {
        ok: true,
        json: async () => ({
          especies: ESPECIES_ESCOPO,
          pontos: { type: 'FeatureCollection', features: PONTOS_ESCOPO },
        }),
      }
    }
    if (rota.startsWith('/api/consulta/busca/?q=')) {
      const termo = decodeURIComponent(rota.replace('/api/consulta/busca/?q=', ''))
      if (termo.toLowerCase().includes('badejo')) {
        return {
          ok: true,
          json: async () => ({
            especies: ESPECIES_BUSCA,
            pontos: { type: 'FeatureCollection', features: [PONTO_BUSCA] },
          }),
        }
      }
      return { ok: true, json: async () => BUSCA_VAZIA }
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

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CA-6: busca no mapa com FTS (sem redirect)', () => {
  it('a lupa abre o submenu com input e a busca roda com debounce', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    render(<MapView />)

    await usuario.click(screen.getByTestId('ferramenta-pesquisar'))
    expect(screen.getByTestId('caixa-busca')).toHaveAttribute('data-aberto', 'true')
    const campo = screen.getByTestId('campo-busca')
    expect(campo).toBeInTheDocument()
    expect(
      fetchFake.mock.calls.filter((chamada) => String(chamada[0]).includes('busca')),
    ).toHaveLength(0)

    await usuario.type(campo, 'badejo')
    await vi.waitFor(() => {
      expect(fetchFake).toHaveBeenCalledWith('/api/consulta/busca/?q=badejo')
    })
    expect(screen.getByTestId('resultado-busca')).toBeInTheDocument()
  })

  it('o menu de animais mostra 5 itens com rolagem de no máximo 3 (max-h + no-scrollbar)', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    await usuario.click(screen.getByTestId('ferramenta-pesquisar'))
    await usuario.type(screen.getByTestId('campo-busca'), 'badejo')
    await vi.waitFor(() => {
      expect(screen.getByTestId('resultado-animal-badejo')).toBeInTheDocument()
    })

    const menu = screen.getByTestId('resultado-busca')
    const lista = menu.querySelector('ul')
    expect(lista).not.toBeNull()
    expect(lista?.className).toContain('max-h-[7.5rem]')
    expect(lista?.className).toContain('overflow-y-auto')
    expect(lista?.className).toContain('no-scrollbar')
    expect(screen.getByTestId('resultado-animal-garoupa')).toBeInTheDocument()
    expect(screen.getByTestId('resultado-animal-pescada-amarela')).toBeInTheDocument()
    expect(screen.getByTestId('resultado-animal-guaiamum')).toBeInTheDocument()
    expect(screen.getByTestId('resultado-animal-sardinha-laje')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^resultado-animal-/)).toHaveLength(5)
  })

  it('destaca os pontos com match, apaga os demais e não sobe pin automático', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    await usuario.click(screen.getByTestId('ferramenta-pesquisar'))
    await usuario.type(screen.getByTestId('campo-busca'), 'badejo')
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(3)
    })

    const pontoNoronha = ouvinteDoPonto('Fernando de Noronha')
    expect(pontoNoronha).toBeDefined()
    expect(pontoNoronha).toHaveAttribute('data-destacado', 'true')
    expect(pontoNoronha?.className).toContain('size-6')
    expect(pontoNoronha?.className).toContain('bg-amber-500')
    expect(pontoNoronha?.className).toContain('ring-amber-400')

    for (const nome of ['Parnaíba', 'Camocim']) {
      const ponto = ouvinteDoPonto(nome)
      expect(ponto).toHaveAttribute('data-destacado', 'false')
      expect(ponto?.className).toContain('size-3')
      expect(ponto?.className).toContain('opacity-40')
    }
    expect(screen.queryByTestId('pin-area')).toBeNull()
  })

  it('clicar num animal do menu destaca os pontos dele sem pin', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    await usuario.click(screen.getByTestId('ferramenta-pesquisar'))
    await usuario.type(screen.getByTestId('campo-busca'), 'badejo')
    await vi.waitFor(() => {
      expect(screen.getByTestId('resultado-animal-guaiamum')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('resultado-animal-guaiamum'))

    const pontoCamocim = ouvinteDoPonto('Camocim')
    expect(pontoCamocim).toHaveAttribute('data-destacado', 'true')
    expect(pontoCamocim?.className).toContain('size-6')
    expect(pontoCamocim?.className).toContain('bg-amber-500')

    for (const nome of ['Parnaíba', 'Fernando de Noronha']) {
      const ponto = ouvinteDoPonto(nome)
      expect(ponto).toHaveAttribute('data-destacado', 'false')
      expect(ponto?.className).toContain('opacity-40')
    }
    expect(screen.queryByTestId('pin-area')).toBeNull()
  })

  it('fechar o submenu limpa o destaque e o escopo volta ao normal', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    await usuario.click(screen.getByTestId('ferramenta-pesquisar'))
    await usuario.type(screen.getByTestId('campo-busca'), 'badejo')
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(3)
    })

    await usuario.click(screen.getByTestId('busca-voltar'))
    expect(screen.getByTestId('caixa-busca')).toHaveAttribute('data-aberto', 'false')
    expect(screen.queryByTestId('resultado-busca')).toBeNull()

    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })
    for (const ponto of screen.getAllByTestId('ponto-area')) {
      expect(ponto).not.toHaveAttribute('data-destacado')
      expect(ponto.className).toContain('size-4')
      expect(ponto.className).toContain('bg-teal-600')
      expect(ponto).not.toHaveAttribute('data-pisca')
    }
  })

  it('termo sem resultado esconde o menu e termo vazio limpa tudo', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    render(<MapView />)

    await usuario.click(screen.getByTestId('ferramenta-pesquisar'))
    await usuario.type(screen.getByTestId('campo-busca'), 'inexistente')
    await vi.waitFor(() => {
      expect(fetchFake).toHaveBeenCalledWith('/api/consulta/busca/?q=inexistente')
    })
    expect(screen.queryByTestId('resultado-busca')).toBeNull()

    await usuario.clear(screen.getByTestId('campo-busca'))
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })
    for (const ponto of screen.getAllByTestId('ponto-area')) {
      expect(ponto).not.toHaveAttribute('data-destacado')
    }
  })
})
