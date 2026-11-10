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

// P1 e P2 dentro do triângulo 1 (10,10)/(30,10)/(20,20); P3 pertence à área 2.
// Os pontos de espécie são GEO-FIXOS: no gesto (mover ou alça) NADA muda
// neles; o conjunto só é reavaliado no release, pela consulta do server.
const AREA_1 = [ponto(1, 'Ponto Um', [12, 11]), ponto(2, 'Ponto Dois', [20, 13])]
const AREA_2 = [ponto(3, 'Ponto Três', [110, 105])]

// PNPOLY local: o server decide o que volta; o fake filtra pelos vértices do
// polígono recebido para simular o release "honesto" (ponto fora não volta).
function dentroDoPoligono(coordenada: [number, number], anel: number[][]): boolean {
  const [x, y] = coordenada
  let dentro = false
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i, i += 1) {
    const [xi, yi] = anel[i]
    const [xj, yj] = anel[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      dentro = !dentro
    }
  }
  return dentro
}

function configurarFetch(filtrarPeloPoligono = false) {
  const fetchFake = vi.fn(async (_rota: RequestInfo | URL, init?: RequestInit) => {
    const corpo = init?.body ? JSON.parse(String(init.body)) : {}
    const anel: number[][] | undefined = corpo?.poligono?.coordinates?.[0]
    const primeiro = anel?.[0]?.[0]
    const bruto = primeiro == null ? [...AREA_1, ...AREA_2] : primeiro < 50 ? AREA_1 : AREA_2
    const pontos =
      filtrarPeloPoligono && anel
        ? bruto.filter((item) =>
            dentroDoPoligono(item.geometry.coordinates as [number, number], anel),
          )
        : bruto
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

async function prepararAreaUm(filtrarPeloPoligono = false) {
  const usuario = userEvent.setup()
  const fetchFake = configurarFetch(filtrarPeloPoligono)
  render(<MapView />)
  await usuario.click(screen.getByTestId('ferramenta-desenhar'))
  await desenhar(screen.getByTestId('mapa-container'))
  await vi.waitFor(() => {
    expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
  })
  await usuario.click(screen.getByTestId('ferramenta-arrastar'))
  return { usuario, fetchFake, container: screen.getByTestId('mapa-container') }
}

// Os pontos de espécie não podem ter estilo inline (transform/display) nem
// posição React alterada pelo gesto — assert DIRETO após o mousemove.
function expectPontosImoveis() {
  const um = screen.getByLabelText('Ponto Um')
  const dois = screen.getByLabelText('Ponto Dois')
  for (const botao of [um, dois]) {
    expect(botao.style.transform).toBe('')
    expect(botao.style.display).toBe('')
  }
  expect(um.style.left).toBe('12px')
  expect(um.style.top).toBe('11px')
  expect(dois.style.left).toBe('20px')
  expect(dois.style.top).toBe('13px')
  expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
}

describe('CA-5: pontos de espécie imóveis durante o gesto (geo-fixos)', () => {
  it('mover: pontos NÃO mudam estilo/posição no gesto e NÃO disparam consulta', async () => {
    const { fetchFake, container } = await prepararAreaUm()
    const antes = consultas(fetchFake).length

    // Gesto de mover a área 1: mousedown no interior (20,13) e +5px em x.
    fireEvent.mouseDown(container, { clientX: 20, clientY: 13 })
    expect(container).toHaveAttribute('data-editando', 'true')
    fireEvent.mouseMove(window, { clientX: 25, clientY: 13 })

    expectPontosImoveis()
    expect(consultas(fetchFake).length).toBe(antes)

    fireEvent.mouseUp(window)
  })

  it('alça: encolher NÃO esconde nem move pontos no gesto; conjunto muda só no release', async () => {
    const { fetchFake, container } = await prepararAreaUm(true)
    const antes = consultas(fetchFake).length

    // Alça-0 (10,10): puxa até (16,10) — P1 (12,11) sairia do anel vivo.
    fireEvent.mouseDown(screen.getByTestId('alca-0'))
    expect(container).toHaveAttribute('data-editando', 'true')
    fireEvent.mouseMove(window, { clientX: 16, clientY: 10 })

    // DURANTE o gesto nada some: pontos imóveis e visíveis, sem consulta.
    expectPontosImoveis()
    expect(screen.getByLabelText('Ponto Um')).toBeInTheDocument()
    expect(consultas(fetchFake).length).toBe(antes)

    // No release o server reavalia: P1 (12,11) ficou fora do anel encolhido.
    fireEvent.mouseUp(window)
    await vi.waitFor(() => {
      expect(consultas(fetchFake).length).toBeGreaterThan(antes)
      expect(screen.queryByLabelText('Ponto Um')).toBeNull()
    })
    expect(screen.getAllByTestId('ponto-area')).toHaveLength(1)
  })
})

describe('CA-5: quadro do gesto 100% no DOM (ghost) e canvas oculto', () => {
  it('poligono-gesto existe no gesto e seus points atualizam sincronos por mousemove', async () => {
    await prepararAreaUm()
    const container = screen.getByTestId('mapa-container')

    // Sem gesto: ghost ausente.
    expect(screen.queryByTestId('area-gesto')).toBeNull()

    // Mover: anel vivo = original + delta de tela (projeção identidade).
    fireEvent.mouseDown(container, { clientX: 20, clientY: 13 })
    expect(screen.getByTestId('area-gesto')).toBeInTheDocument()
    const poligono = screen.getByTestId('poligono-gesto')
    expect(poligono.getAttribute('points')).toContain('10,10')

    fireEvent.mouseMove(window, { clientX: 25, clientY: 13 })
    // Sincrono: sem waitFor — o setAttribute acontece no mesmo tick.
    const pontosAoVivo = poligono.getAttribute('points') as string
    expect(pontosAoVivo).toBe('15,10 35,10 25,20 15,10')

    // Alça: anel vivo segue o cursor no primeiro vértice (área já movida +5).
    fireEvent.mouseUp(window)
    fireEvent.mouseDown(screen.getByTestId('alca-0'))
    fireEvent.mouseMove(window, { clientX: 16, clientY: 10 })
    expect(screen.getByTestId('poligono-gesto').getAttribute('points')).toBe(
      '16,10 35,10 25,20 16,10',
    )
    fireEvent.mouseUp(window)
  })

  it('feature editada leva emEdicao: true no setData vivo e sem emEdicao no release', async () => {
    await prepararAreaUm()
    const fonte = { setData: vi.fn() }
    estadoMapa.fonte = fonte
    const container = screen.getByTestId('mapa-container')

    fireEvent.mouseDown(container, { clientX: 20, clientY: 13 })
    fireEvent.mouseMove(window, { clientX: 25, clientY: 13 })

    const dadosAoVivo = fonte.setData.mock.calls.at(-1)?.[0]
    expect(dadosAoVivo.features[0].properties.emEdicao).toBe(true)
    expect(dadosAoVivo.features[0].geometry.coordinates[0][0]).toEqual([15, 10])

    fireEvent.mouseUp(window)
    await vi.waitFor(() => {
      const dadosFinal = fonte.setData.mock.calls.at(-1)?.[0]
      expect(dadosFinal.features[0].properties.emEdicao).toBe(false)
      expect(dadosFinal.features[0].geometry.coordinates[0][0]).toEqual([15, 10])
    })
  })

  it('ghost some no mouseUp (sem flicker: o canvas reassume o anel gravado)', async () => {
    await prepararAreaUm()
    const fonte = { setData: vi.fn() }
    estadoMapa.fonte = fonte
    const container = screen.getByTestId('mapa-container')

    fireEvent.mouseDown(container, { clientX: 20, clientY: 13 })
    fireEvent.mouseMove(window, { clientX: 25, clientY: 13 })
    expect(screen.getByTestId('area-gesto')).toBeInTheDocument()

    fireEvent.mouseUp(window)
    expect(screen.queryByTestId('area-gesto')).toBeNull()
    expect(screen.queryByTestId('poligono-gesto')).toBeNull()
    // O setData final do release reassume o anel real (sem emEdicao).
    await vi.waitFor(() => {
      const dadosFinal = fonte.setData.mock.calls.at(-1)?.[0]
      expect(dadosFinal.features[0].properties.emEdicao).toBe(false)
    })
  })
})

describe('CA-5: release, pin e consultas (sem regressão)', () => {
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

  it('pin permanece durante o gesto e fecha no release quando o ponto sai da área', async () => {
    const usuario = userEvent.setup()
    await prepararAreaUm(true)
    await usuario.click(screen.getByLabelText('Ponto Um'))
    expect(screen.getByTestId('pin-area')).toBeInTheDocument()

    // DURANTE o gesto (alça encolhendo) o pin NÃO é avaliado: permanece.
    fireEvent.mouseDown(screen.getByTestId('alca-0'))
    fireEvent.mouseMove(window, { clientX: 16, clientY: 10 })
    expect(screen.getByTestId('pin-area')).toBeInTheDocument()

    // Release: a consulta devolve o conjunto novo (P1 fora) — o pin fecha.
    fireEvent.mouseUp(window)
    await vi.waitFor(() => {
      const vivos = screen
        .queryAllByTestId('pin-area')
        .filter((pin) => !pin.classList.contains('pin-sumir'))
      expect(vivos).toHaveLength(0)
    })
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
