import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapView } from './MapView'
import { anelDaElipse } from '@/utils/geo'

const estadoMapa = vi.hoisted(() => ({
  instancias: [] as any[],
  disparoImediato: true,
  // Fonte 'area-desenhada' controlável por teste (null = mapa sem fonte).
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

function configurarFetch() {
  const fetchFake = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

const consultas = (fetchFake: ReturnType<typeof vi.fn>) =>
  fetchFake.mock.calls.filter((chamada: any[]) => chamada[0] === '/api/consulta/area/')

const mapaAtual = () => estadoMapa.instancias[estadoMapa.instancias.length - 1]

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  estadoMapa.fonte = null
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// CA-5 (lapidação 4, item 5): áreas desenhadas viram editáveis no modo
// ARRASTAR — arrastar o interior move a área inteira e a alça move um
// vértice; enquanto o gesto dura, data-editando está no mapa.
describe('CA-5: edição de áreas desenhadas arrastando', () => {
  it('arrastar o interior move TODOS os vértices e re-dispara a consulta', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 30, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 20, clientY: 20 })
    fireEvent.mouseUp(container)

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    // Alças na área ativa (3 vértices de triângulo).
    expect(screen.getByTestId('alca-0')).toBeInTheDocument()
    expect(screen.getByTestId('alca-2')).toBeInTheDocument()
    expect(container).not.toHaveAttribute('data-editando')

    // Mouses: mousedown no interior do triângulo ((18,12) está dentro).
    fireEvent.mouseDown(container, { clientX: 18, clientY: 12 })
    expect(container).toHaveAttribute('data-editando', 'true')
    expect(mapaAtual().dragPan.disable).toHaveBeenCalled()

    // Gesto pela JANELA: translação de (+5, +5) em todos os vértices.
    fireEvent.mouseMove(window, { clientX: 23, clientY: 17 })
    expect(container).toHaveAttribute('data-editando', 'true')

    fireEvent.mouseUp(window)
    expect(container).not.toHaveAttribute('data-editando')
    expect(mapaAtual().dragPan.enable).toHaveBeenCalled()

    const poligono = JSON.parse(container.getAttribute('data-poligono-desenhado') as string)
    expect(poligono.coordinates[0]).toEqual([
      [15, 15],
      [35, 15],
      [25, 25],
      [15, 15],
    ])

    // A mudança re-dispara a consulta com o polígono novo.
    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      expect(chamadas.length).toBeGreaterThanOrEqual(2)
      const corpo = JSON.parse(String(chamadas[chamadas.length - 1][1].body))
      expect(corpo.poligono.coordinates[0][0]).toEqual([15, 15])
    })
  })

  it('arrastar a alça-0 move SÓ o vértice escolhido e mantém área positiva', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    const fonte = { setData: vi.fn() }
    estadoMapa.fonte = fonte
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 30, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 20, clientY: 20 })
    fireEvent.mouseUp(container)

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    // Alça 0 está em ((10,10)): arrastar até ((12,19)) — o triângulo permanece
    // positivo ((guaiamum... a área antiga não colapsa com esse movimento)).
    fireEvent.mouseDown(screen.getByTestId('alca-0'))
    expect(container).toHaveAttribute('data-editando', 'true')
    expect(screen.getByTestId('alca-0')).toHaveAttribute('data-editando', 'true')

    // AO VIVO: o fill/contorno acompanham o vértice direto na fonte do mapa,
    // enquanto o polígono GRAVADO (estado `areas`) só muda ao soltar.
    const chamadasAntes = fonte.setData.mock.calls.length
    fireEvent.mouseMove(window, { clientX: 12, clientY: 19 })
    expect(fonte.setData.mock.calls.length).toBeGreaterThan(chamadasAntes)
    const dadosAoVivo = fonte.setData.mock.calls.at(-1)?.[0]
    expect(dadosAoVivo.type).toBe('FeatureCollection')
    expect(dadosAoVivo.features).toHaveLength(1)
    expect(dadosAoVivo.features[0].properties).toEqual({ id: '1', nome: 'Área 1', ativa: false })
    expect(dadosAoVivo.features[0].geometry.coordinates[0]).toEqual([
      [12, 19],
      [30, 10],
      [20, 20],
      [12, 19],
    ])

    fireEvent.mouseUp(window)

    const poligono = JSON.parse(container.getAttribute('data-poligono-desenhado') as string)
    expect(poligono.coordinates[0]).toEqual([
      [12, 19],
      [30, 10],
      [20, 20],
      [12, 19],
    ])
    expect(container).not.toHaveAttribute('data-editando')
  })

  it('alças acompanham o anel do setData NO MESMO tick do mousemove (sem atraso)', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    const fonte = { setData: vi.fn() }
    estadoMapa.fonte = fonte
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 30, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 20, clientY: 20 })
    fireEvent.mouseUp(container)

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    // Gesto de alça pela janela: o último setData e os círculos imperativos
    // saem do MESMO dispatch de mousemove — sem waitFor, mesma deixa.
    fireEvent.mouseDown(screen.getByTestId('alca-0'))
    const chamadasAntes = fonte.setData.mock.calls.length
    fireEvent.mouseMove(window, { clientX: 12, clientY: 19 })
    expect(fonte.setData.mock.calls.length).toBeGreaterThan(chamadasAntes)

    const anel = fonte.setData.mock.calls.at(-1)?.[0].features[0].geometry.coordinates[0] as number[][]
    const alcas = container.parentElement!.querySelectorAll(
      '[data-testid="alcas-area"] circle[data-testid^="alca-"]',
    )
    expect(alcas).toHaveLength(anel.length - 1)
    for (let indice = 0; indice < anel.length - 1; indice += 1) {
      const alca = alcas[indice] as SVGCircleElement
      expect(alca.getAttribute('cx')).toBe(String(anel[indice][0]))
      expect(alca.getAttribute('cy')).toBe(String(anel[indice][1]))
    }

    fireEvent.mouseUp(window)
  })

  it('clique fora de área continua neste modo sem pegar o ponteiro (data-editando ausente)', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 30, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 20, clientY: 20 })
    fireEvent.mouseUp(container)

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    // (60,60) está fora do triângulo ((10..30, 10..20)) — sem edição.
    fireEvent.mouseDown(container, { clientX: 60, clientY: 60 })
    expect(container).not.toHaveAttribute('data-editando')
  })
})

// Círculo com modelo de elipse: 5 alças (tamanho + eixos) em vez das 32
// vértices; regeneração do anel pela util compartilhada. Áreas sem modelo
// continuam com uma alça por vértice. Lapidação 11: o gesto de desenho já
// nasce ELÍPSE — o helper arrasta diagonal p/ rx=20, ry=10 independentes.
describe('CA-5: círculo/elipse com 5 alças', () => {
  function desenharCirculo(): HTMLElement {
    const container = screen.getByTestId('mapa-container')
    fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 30, clientY: 20 })
    fireEvent.mouseUp(container)
    return container
  }

  it('círculo criado mostra exatamente 5 alças (alca-0..4, sem alca-5)', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await usuario.click(screen.getByTestId('desenho-circulo'))

    desenharCirculo()
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    for (let indice = 0; indice <= 4; indice += 1) {
      expect(screen.getByTestId(`alca-${indice}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId('alca-5')).not.toBeInTheDocument()
  })

  it('alça SE escala rx E ry pelo MESMO fator da alça-inicial, sem salto', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await usuario.click(screen.getByTestId('desenho-circulo'))

    const container = desenharCirculo()
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    // SE do modelo (centro [10,10], rx=20, ry=10): a âncora da escala é a
    // PRÓPRIA alça inicial — o fator é dist(centro→cursor)/dist(centro→alça),
    // que vale exatamente 1 quando o cursor está na alça (sem salto da 1ª
    // delta p/ qualquer aperto, mesmo alguns px fora do centro da alça).
    const fatorSE = Math.SQRT2 / 2
    const seX = 10 + 20 * fatorSE
    const seY = 10 + 10 * fatorSE
    const distAlca = Math.hypot(20 * fatorSE, 10 * fatorSE)

    estadoMapa.fonte = { setData: vi.fn() }
    fireEvent.mouseDown(screen.getByTestId('alca-4'), { clientX: seX, clientY: seY })
    // 2 eventos com passos pequenos: nenhuma "pulo" entre eles — cada rx sai
    // do fator contínuo do SEU cursor.
    fireEvent.mouseMove(window, { clientX: 25, clientY: 18 })
    const fonteAoVivo = (estadoMapa.fonte?.setData.mock.calls.at(-1)?.[0] as any).features[0]
      .geometry.coordinates[0] as number[][]
    const fator1 = Math.max(Math.hypot(15, 8) / distAlca, 0.05)
    expect(fonteAoVivo[0][0] - 10).toBeCloseTo(20 * fator1, 10)
    expect(fonteAoVivo[0][1]).toBeCloseTo(10, 10)

    fireEvent.mouseMove(window, { clientX: 26, clientY: 19 })
    fireEvent.mouseUp(window)

    const poligono = JSON.parse(container.getAttribute('data-poligono-desenhado') as string)
    const fator2 = Math.max(Math.hypot(16, 9) / distAlca, 0.05)
    // Anel regenerado: maior, fechado, centro preservado e PROPORCIONAL
    // (rx/ry do modelo inicial escalados pelo mesmo fator).
    expect(poligono.coordinates[0]).toEqual(anelDaElipse([10, 10], 20 * fator2, 10 * fator2))
    const anel = poligono.coordinates[0] as number[][]
    expect(anel).toHaveLength(33)
    // Vértice oposto (índice 16 do arco) vs primeiro: ponto médio = centro.
    const centro: [number, number] = [
      (anel[0][0] + anel[16][0]) / 2,
      (anel[0][1] + anel[16][1]) / 2,
    ]
    expect(centro[0]).toBeCloseTo(10)
    expect(centro[1]).toBeCloseTo(10)
  })

  it('alça E altera só o rx: anel mais largo com ry intacto', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await usuario.click(screen.getByTestId('desenho-circulo'))

    const container = desenharCirculo()
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    // E=(30,10): arrastar até (45,10) → rx = |45-10| = 35; ry continua 10.
    fireEvent.mouseDown(screen.getByTestId('alca-0'), { clientX: 30, clientY: 10 })
    fireEvent.mouseMove(window, { clientX: 45, clientY: 10 })
    fireEvent.mouseUp(window)

    const anel = JSON.parse(
      container.getAttribute('data-poligono-desenhado') as string,
    ).coordinates[0] as number[][]
    expect(anel).toEqual(anelDaElipse([10, 10], 35, 10))
  })

  it('áreas sem modelo (livre) continuam com uma alça por vértice', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    fireEvent.mouseDown(screen.getByTestId('mapa-container'), { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(screen.getByTestId('mapa-container'), { clientX: 30, clientY: 10 })
    fireEvent.mouseMove(screen.getByTestId('mapa-container'), { clientX: 20, clientY: 20 })
    fireEvent.mouseUp(screen.getByTestId('mapa-container'))

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    // 3 vértices + fechamento = 3 alças (último vértice não vira alça).
    expect(screen.getByTestId('alca-2')).toBeInTheDocument()
    expect(screen.queryByTestId('alca-3')).not.toBeInTheDocument()
  })
})
