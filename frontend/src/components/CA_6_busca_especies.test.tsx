import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'

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

const ESPECIES = [
  {
    slug: 'caranguejo-uca',
    nome_popular: 'Caranguejo-uçá',
    nome_cientifico: 'Ucides cordatus',
    imagem: 'biodiversidade/midia/caranguejo-uca.svg',
  },
  {
    slug: 'caranguejo-maria-farinha',
    nome_popular: 'Caranguejo maria-farinha',
    nome_cientifico: 'Ocypode quadrata',
    imagem: 'biodiversidade/midia/caranguejo-maria-farinha.svg',
  },
  {
    slug: 'caranguejeiro-laranja-do-norte',
    nome_popular: 'Caranguejeiro-laranja-do-norte',
    nome_cientifico: null,
    imagem: 'biodiversidade/midia/caranguejeiro-laranja-do-norte.svg',
  },
]

// O FTS do servidor: ?q= casa nome popular/científico e a URL chega
// codificada (o teste codifica igual ao usuário real).
function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    const rota = String(entrada)
    if (rota === '/api/ping/') {
      return { ok: true, json: async () => ({ status: 'ok' }) }
    }
    if (rota.startsWith('/api/especies/?q=')) {
      const termo = decodeURIComponent(rota.slice('/api/especies/?q='.length)).toLowerCase()
      const casados = ESPECIES.filter(
        (item) =>
          item.nome_popular.toLowerCase().includes(termo) ||
          (item.nome_cientifico ?? '').toLowerCase().includes(termo),
      )
      return { ok: true, json: async () => casados }
    }
    if (rota === '/api/especies/') {
      return { ok: true, json: async () => ESPECIES }
    }
    return { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

const chamadasCom = (fetchFake: ReturnType<typeof vi.fn>, trecho: string) =>
  fetchFake.mock.calls.filter((chamada: any[]) => String(chamada[0]).includes(trecho))

const chamadasLista = (fetchFake: ReturnType<typeof vi.fn>) =>
  fetchFake.mock.calls.filter((chamada: any[]) => String(chamada[0]) === '/api/especies/')

async function abrirPagina(usuario: ReturnType<typeof userEvent.setup>) {
  const fetchFake = configurarFetch()
  render(<App />)
  await usuario.click(screen.getByTestId('nav-espécies'))
  return fetchFake
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('CA-6: busca por nome na listagem de espécies (FTS no servidor)', () => {
  it('debounce de 300ms dispara o ?q= e a resposta do servidor pinta os cards', async () => {
    const usuario = userEvent.setup()
    const fetchFake = await abrirPagina(usuario)
    expect(await screen.findByTestId('card-especie-caranguejo-uca')).toBeInTheDocument()
    const busca = screen.getByTestId('busca-especies')

    vi.useFakeTimers()
    fireEvent.change(busca, { target: { value: 'maria' } })
    // Debounce NADA sai antes dos 300ms.
    expect(chamadasCom(fetchFake, '?q=')).toHaveLength(0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299)
    })
    expect(chamadasCom(fetchFake, '?q=')).toHaveLength(0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    // Chamada uma e com o termo codificado na query.
    const consultasBusca = chamadasCom(fetchFake, '?q=').map((chamada: any[]) =>
      String(chamada[0]),
    )
    expect(consultasBusca).toEqual(['/api/especies/?q=maria'])

    // Resposta do FTS: só a maria caseu — os cards pintam com o VEIO do backend.
    expect(screen.getByTestId('card-especie-caranguejo-maria-farinha')).toBeInTheDocument()
    expect(screen.queryByTestId('card-especie-caranguejo-uca')).toBeNull()
    expect(screen.queryByTestId('busca-vazia')).toBeNull()
  })

  it('hero compacto com total e grade unica de grupos (1/2/3 colunas)', async () => {
    const usuario = userEvent.setup()
    const fetchFake = await abrirPagina(usuario)
    expect(await screen.findByTestId('card-especie-caranguejo-uca')).toBeInTheDocument()

    // Hero: titulo grande + subtitulo muted + badge solida com o TOTAL do catalogo.
    expect(screen.getByTestId('especies-hero')).toBeInTheDocument()
    expect(screen.getByTestId('especies-titulo').className).toContain('text-3xl')
    const total = screen.getByTestId('especies-total')
    expect(total).toHaveTextContent(/^3$/)
    expect(total.className).toContain('bg-accent')

    // Grade unica: os 3 grupos dividem a MESMA linha (lg), colunas menores md/mobile.
    const grade = screen.getByTestId('especies-grid')
    expect(grade.className).toContain('grid-cols-1')
    expect(grade.className).toContain('md:grid-cols-2')
    expect(grade.className).toContain('lg:grid-cols-3')

    expect(chamadasLista(fetchFake)).toHaveLength(1)
  })

  it('termo com acento é codificado na query (encodeURIComponent) e a resposta pinta', async () => {
    const usuario = userEvent.setup()
    const fetchFake = await abrirPagina(usuario)
    expect(await screen.findByTestId('card-especie-caranguejo-uca')).toBeInTheDocument()

    const busca = screen.getByTestId('busca-especies')
    fireEvent.change(busca, { target: { value: 'uçá' } })
    await vi.waitFor(() => {
      expect(chamadasCom(fetchFake, '?q=u%C3%A7%C3%A1')).toHaveLength(1)
    })
    // O termo via codificado, o servidor consultou e devolveu só o uçá.
    expect(await screen.findByTestId('card-especie-caranguejo-uca')).toBeInTheDocument()
    expect(screen.queryByTestId('card-especie-caranguejo-maria-farinha')).toBeNull()
  })

  it('zero resultados mostra o aviso; limpar o campo recarrega a lista completa', async () => {
    const usuario = userEvent.setup()
    const fetchFake = await abrirPagina(usuario)
    expect(await screen.findByTestId('card-especie-caranguejo-maria-farinha')).toBeInTheDocument()

    const busca = screen.getByTestId('busca-especies')
    fireEvent.change(busca, { target: { value: 'inexistente' } })
    expect(await screen.findByTestId('busca-vazia')).toBeInTheDocument()
    expect(screen.queryByTestId('card-especie-caranguejo-uca')).toBeNull()
    expect(screen.queryByTestId('card-especie-caranguejo-maria-farinha')).toBeNull()

    // Lista volta: limpar o campo devolve a LISTA COMPLETA do servidor.
    const listasAntes = chamadasLista(fetchFake).length
    fireEvent.change(busca, { target: { value: '' } })
    expect(await screen.findByTestId('card-especie-caranguejo-uca')).toBeInTheDocument()
    expect(chamadasLista(fetchFake).length).toBeGreaterThan(listasAntes)
    expect(screen.queryByTestId('busca-vazia')).toBeNull()
  })
})
