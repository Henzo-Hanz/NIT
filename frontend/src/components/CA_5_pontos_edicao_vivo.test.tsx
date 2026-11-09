import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapView } from './MapView'

const estadoMapa = vi.hoisted(() => ({
  instancias: [] as any[],
  disparoImediato: true,
  fonte: null as { setData: ReturnType<typeof vi.fn> } | null,
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
    project = vi.fn((coordenadas: [number, number]) => ({ x: coordenadas[0], y: coordenadas[1] }))
    unproject = vi.fn(([x, y]: [number, number]) => [x, y])
    getSource = vi.fn(() => estadoMapa.fonte)
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
  { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 2 },
  { slug: 'guaiamum', nome_popular: 'Guaiamum', contagem: 1 },
]

const ponto = (id: number, nome: string, coordenadas: [number, number]) => ({
  type: 'Feature',
  properties: {
    id,
    nome,
    descricao: '1 espécie encontrada',
    especie_slugs: ['guaiamum'],
    total: 1,
  },
  geometry: { type: 'Point' as const, coordinates: coordenadas },
})

// P1 e P2 dentro do triângulo 1 (10,10)/(30,10)/(20,20); após mover +5 no eixo
// x, P1 (12,11) sai do anel vivo e P2 (20,13) permanece. P3 pertence à área 2.
const AREA_1 = [ponto(1, 'Ponto Um', [12, 11]), ponto(2, 'Ponto Dois', [20, 13])]
const AREA_2 = [ponto(3, 'Ponto Três', [110, 105])]

function configurarFetch() {
  const fetchFake = vi.fn(async (_rota: RequestInfo | URL, init?: RequestInit) => {
    const corpo = init?.body ? JSON.parse(String(init.body)) : {}
    const primeiro = corpo?.poligono?.coordinates?.[0]?.[0]?.[0]
    const pontos = primeiro == null ? [...AREA_1, ...AREA_2] : primeiro < 50 ? AREA_1 : AREA_2
    return {
      ok: true,
      json: async () => ({
        especies: ESPECIES,
        pontos: { type: 'FeatureCollection', features: pontos },
      }),
    }
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

const consultas = (fetchFake: ReturnType<typeof vi.fn>) =>
  fetchFake.mock.calls.filter((chamada: any[]) => chamada[0] === '/api/consulta/area/')

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  estadoMapa.fonte = null
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function desenhar(container: HTMLElement, deslocamento = 0) {
  const x = 10 + deslocamento
  const y = 10 + deslocamento
  fireEvent.mouseDown(container, { clientX: x, clientY: y })
  fireEvent.mouseMove(container, { clientX: x + 20, clientY: y })
  fireEvent.mouseMove(container, { clientX: x + 10, clientY: y + 10 })
  fireEvent.mouseUp(container)
}

async function prepararAreaUm() {
  const usuario = userEvent.setup()
  const fetchFake = configurarFetch()
  render(<MapView />)
  await usuario.click(screen.getByTestId('ferramenta-desenhar'))
  await desenhar(screen.getByTestId('mapa-container'))
  await vi.waitFor(() => {
    expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
  })
  await usuario.click(screen.getByTestId('ferramenta-arrastar'))
  return { usuario, fetchFake, container: screen.getByTestId('mapa-container') }
}

describe('CA-5: pontos acompanham o polígono AO VIVO durante a edição', () => {
  it('pontos que saem do anel vivo somem na hora e NÃO disparam consulta', async () => {
    const { fetchFake, container } = await prepararAreaUm()
    const antes = consultas(fetchFake).length

    // Gesto de mover a área 1: mousedown no interior (20,13) e +5px em x.
    fireEvent.mouseDown(container, { clientX: 20, clientY: 13 })
    expect(container).toHaveAttribute('data-editando', 'true')
    fireEvent.mouseMove(window, { clientX: 25, clientY: 13 })

    // P1 (12,11) ficou fora do anel vivo; P2 continua dentro.
    expect(screen.queryByLabelText('Ponto Um')).toBeNull()
    expect(screen.getByLabelText('Ponto Dois')).toBeInTheDocument()
    expect(screen.getAllByTestId('ponto-area')).toHaveLength(1)
    expect(consultas(fetchFake).length).toBe(antes)

    fireEvent.mouseUp(window)
  })

  it('release dispara 1 POST só da área editada e o resultado volta reconciliado', async () => {
    const { fetchFake, container } = await prepararAreaUm()
    const antes = consultas(fetchFake).length

    fireEvent.mouseDown(container, { clientX: 20, clientY: 13 })
    fireEvent.mouseMove(window, { clientX: 25, clientY: 13 })
    fireEvent.mouseUp(window)

    await vi.waitFor(() => {
      expect(consultas(fetchFake).length).toBe(antes + 1)
    })
    const corpo = JSON.parse(String(consultas(fetchFake).at(-1)?.[1].body))
    expect(corpo.poligono.coordinates[0][0]).toEqual([15, 10])
    // Reconciliado pelo server: P1 volta a existir.
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })
  })

  it('pin do ponto ativo fecha na hora quando ele sai do anel vivo', async () => {
    const usuario = userEvent.setup()
    const { container } = await prepararAreaUm()
    await usuario.click(screen.getByLabelText('Ponto Um'))
    expect(screen.getByTestId('pin-area')).toBeInTheDocument()

    fireEvent.mouseDown(container, { clientX: 20, clientY: 13 })
    fireEvent.mouseMove(window, { clientX: 25, clientY: 13 })

    await vi.waitFor(() => {
      expect(screen.queryByTestId('pin-area')).toBeNull()
    })
    fireEvent.mouseUp(window)
  })

  it('com duas áreas, o release mescla o cache e mantém os pontos da outra área', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    const container = screen.getByTestId('mapa-container')
    await desenhar(container)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })
    await desenhar(container, 90)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(3)
    })
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))
    const antes = consultas(fetchFake).length

    // Edita SÓ a área 1 (mousedown no interior dela).
    fireEvent.mouseDown(container, { clientX: 20, clientY: 13 })
    fireEvent.mouseMove(window, { clientX: 25, clientY: 13 })
    // Outra área permanece intacta durante o gesto.
    expect(screen.getByLabelText('Ponto Três')).toBeInTheDocument()
    fireEvent.mouseUp(window)

    await vi.waitFor(() => {
      expect(consultas(fetchFake).length).toBe(antes + 1)
    })
    const ultimo = JSON.parse(String(consultas(fetchFake).at(-1)?.[1].body))
    expect(ultimo.poligono.coordinates[0][0]).toEqual([15, 10])
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(3)
    })
    expect(screen.getByLabelText('Ponto Três')).toBeInTheDocument()
  })

  it('trocar o filtro continua re-consultando (sem regressão)', async () => {
    const { usuario, fetchFake } = await prepararAreaUm()
    const antes = consultas(fetchFake).length

    await usuario.click(screen.getByTestId('filtro-mais'))

    await vi.waitFor(() => {
      expect(consultas(fetchFake).length).toBeGreaterThan(antes)
    })
    const corpo = JSON.parse(String(consultas(fetchFake).at(-1)?.[1].body))
    expect(corpo.ordenar).toBe('mais')
  })
})
