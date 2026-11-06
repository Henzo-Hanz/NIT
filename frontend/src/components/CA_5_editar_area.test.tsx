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

// Círculo com modelo de elipse: 4 alças, uma por FACE do bbox (E, W, N, S),
// em vez das 32 vértices. Cada alça move SÓ a sua face e mantém a OPOSTA
// fixa (sem crescimento simétrico). Áreas sem modelo continuam com uma alça
// por vértice. Lapidação 11: o gesto de desenho já nasce ELÍPSE — o helper
// arrasta diagonal p/ rx=20, ry=10 independentes (centro [10,10]).
describe('CA-5: círculo/elipse com 4 alças de face (oposta ancorada)', () => {
  function desenharCirculo(): HTMLElement {
    const container = screen.getByTestId('mapa-container')
    fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 30, clientY: 20 })
    fireEvent.mouseUp(container)
    return container
  }

  async function prepararElipse(): Promise<HTMLElement> {
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
    return container
  }

  const bboxDoAnel = (anel: number[][]) => {
    const xs = anel.slice(0, -1).map((ponto) => ponto[0])
    const ys = anel.slice(0, -1).map((ponto) => ponto[1])
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      bottom: Math.min(...ys),
      top: Math.max(...ys),
    }
  }

  const anelGravado = (container: HTMLElement) =>
    JSON.parse(container.getAttribute('data-poligono-desenhado') as string)
      .coordinates[0] as number[][]

  it('círculo criado mostra exatamente 4 alças (alca-0..3, sem alca-4)', async () => {
    await prepararElipse()

    for (let indice = 0; indice <= 3; indice += 1) {
      expect(screen.getByTestId(`alca-${indice}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId('alca-4')).not.toBeInTheDocument()
  })

  it('puxar N move só o topo: bottom fica fixo', async () => {
    const container = await prepararElipse()
    const fonte = { setData: vi.fn() }
    estadoMapa.fonte = fonte

    // N=(10,20): puxa até 25 → top=25, bottom=0 parado.
    fireEvent.mouseDown(screen.getByTestId('alca-2'), { clientX: 10, clientY: 20 })
    fireEvent.mouseMove(window, { clientX: 10, clientY: 25 })
    const chamadaAoVivo = fonte.setData.mock.calls.at(-1) as any
    const aoVivo = chamadaAoVivo[0].features[0].geometry.coordinates[0] as number[][]
    expect(aoVivo).toEqual(anelDaElipse([10, 12.5], 20, 12.5))
    expect(bboxDoAnel(aoVivo).bottom).toBe(0)
    fireEvent.mouseUp(window)

    const anel = anelGravado(container)
    expect(anel).toEqual(anelDaElipse([10, 12.5], 20, 12.5))
    const bbox = bboxDoAnel(anel)
    expect(bbox.bottom).toBe(0)
    expect(bbox.top).toBe(25)
  })

  it('puxar S move só a base: top fica fixo', async () => {
    const container = await prepararElipse()

    // S=(10,0): puxa até -5 → bottom=-5, top=20 parado.
    fireEvent.mouseDown(screen.getByTestId('alca-3'), { clientX: 10, clientY: 0 })
    fireEvent.mouseMove(window, { clientX: 10, clientY: -5 })
    fireEvent.mouseUp(window)

    const anel = anelGravado(container)
    expect(anel).toEqual(anelDaElipse([10, 7.5], 20, 12.5))
    const bbox = bboxDoAnel(anel)
    expect(bbox.top).toBe(20)
    expect(bbox.bottom).toBe(-5)
  })

  it('puxar E move só a direita: left fica fixo', async () => {
    const container = await prepararElipse()

    // E=(30,10): puxa até 45 → right=45, left=-10 parado.
    fireEvent.mouseDown(screen.getByTestId('alca-0'), { clientX: 30, clientY: 10 })
    fireEvent.mouseMove(window, { clientX: 45, clientY: 10 })
    fireEvent.mouseUp(window)

    const anel = anelGravado(container)
    expect(anel).toEqual(anelDaElipse([17.5, 10], 27.5, 10))
    const bbox = bboxDoAnel(anel)
    expect(bbox.left).toBe(-10)
    expect(bbox.right).toBe(45)
  })

  it('puxar W move só a esquerda: right fica fixo', async () => {
    const container = await prepararElipse()

    // W=(-10,10): puxa até -30 → left=-30, right=30 parado.
    fireEvent.mouseDown(screen.getByTestId('alca-1'), { clientX: -10, clientY: 10 })
    fireEvent.mouseMove(window, { clientX: -30, clientY: 10 })
    fireEvent.mouseUp(window)

    const anel = anelGravado(container)
    expect(anel).toEqual(anelDaElipse([0, 10], 30, 10))
    const bbox = bboxDoAnel(anel)
    expect(bbox.right).toBe(30)
    expect(bbox.left).toBe(-30)
  })

  it('clamp: arrastar N além da base trava no mínimo e bottom continua fixo', async () => {
    const container = await prepararElipse()

    // N além do bottom (0): trava em bottom + 3px, sem inverter/espelhar.
    fireEvent.mouseDown(screen.getByTestId('alca-2'), { clientX: 10, clientY: 20 })
    fireEvent.mouseMove(window, { clientX: 10, clientY: -50 })
    fireEvent.mouseUp(window)

    const anel = anelGravado(container)
    expect(anel).toEqual(anelDaElipse([10, 1.5], 20, 1.5))
    const bbox = bboxDoAnel(anel)
    expect(bbox.bottom).toBe(0)
    expect(bbox.top).toBe(3)
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
