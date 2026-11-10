import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapView } from './MapView'
import { convexHull } from '@/utils/geo'

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

function configurarFetch() {
  const fetchFake = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

async function desenharESelecionar(telaInicial: { clientX: number; clientY: number }, passos: { clientX: number; clientY: number }[]) {
  const usuario = userEvent.setup()
  configurarFetch()
  render(<MapView />)
  await usuario.click(screen.getByTestId('ferramenta-desenhar'))
  await usuario.click(screen.getByTestId(telaInicial ? 'desenho-retangulo' : 'desenho-circulo'))
  const container = screen.getByTestId('mapa-container')
  if (telaInicial) {
    fireEvent.mouseDown(container, telaInicial)
    for (const passo of passos) {
      fireEvent.mouseMove(container, passo)
    }
    fireEvent.mouseUp(container)
  }
  await vi.waitFor(() => {
    expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
  })
  await usuario.click(screen.getByTestId('selecionar-area-1'))
  await usuario.click(screen.getByTestId('ferramenta-arrastar'))
  return { usuario, container }
}

const retanguloValido = (anel: number[][]) => {
  const cantos = anel.slice(0, 4)
  // Fechado e cada vizinho compartilha EXATAMENTE um eixo (rect válido,
  // sem interseção própria/virada).
  expect(anel).toHaveLength(5)
  expect(anel[4]).toEqual(anel[0])
  for (let i = 0; i < 4; i += 1) {
    const a = cantos[i]
    const b = cantos[(i + 1) % 4]
    const compartilha = a[0] === b[0] || a[1] === b[1]
    expect(compartilha).toBe(true)
  }
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  estadoMapa.fonte = null
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// Lapidação 11, ITEM B: redimensionamento em QUALQUER direção. NA EDIÇÃO por
// alça, áreas sem modelo com anel de 4 vértices fechado são TRATADAS COMO
// RETÂNGULO (PREMISSA: anel de 4 = retângulo) — puxar qualquer canto ancora
// o canto OPOSTO e recompõe o rect pelo cursor. Polígonos livres (5+ vértices)
// mantêm o movimento de vértice por alça.
describe('CA-5: retângulo redimensionável em qualquer direção (anel de 4)', () => {
  it('alça puxada na direção "errada" (em direção ao interior/centro) mantém rect válido com o canto oposto ancorado', async () => {
    const { container } = await desenharESelecionar({ clientX: 10, clientY: 10 }, [
      { clientX: 30, clientY: 10 },
      { clientX: 30, clientY: 25 },
    ])
    expect(screen.getByTestId('alca-3')).toBeInTheDocument()
    expect(screen.queryByTestId('alca-4')).not.toBeInTheDocument()

    // Alça 1 em (30,10): puxa para DENTRO, quase cruzando o canto oposto
    // (10,25) — sem virar: o piso ~4px trava por eixo conservando o lado.
    estadoMapa.fonte = { setData: vi.fn() }
    fireEvent.mouseDown(screen.getByTestId('alca-1'))
    fireEvent.mouseMove(window, { clientX: 11, clientY: 26 })
    fireEvent.mouseUp(window)

    const anel = JSON.parse(
      container.getAttribute('data-poligono-desenhado') as string,
    ).coordinates[0] as number[][]
    retanguloValido(anel)
    // Piso: largura/altura mínimas de 4 graus (4px no fake), oposto fixo.
    const largura = Math.abs(anel[0][0] - anel[1][0])
    const altura = Math.abs(anel[1][1] - anel[2][1])
    expect(largura).toBeGreaterThanOrEqual(4)
    expect(altura).toBeGreaterThanOrEqual(4)
    expect(anel).toContainEqual([10, 25])
  })

  it('canto atravessado para o lado oposto: rect recomposto (sem espelho, sempre válido)', async () => {
    const { container } = await desenharESelecionar({ clientX: 10, clientY: 10 }, [
      { clientX: 30, clientY: 10 },
      { clientX: 30, clientY: 25 },
    ])

    // Alça 0 em (10,10): puxa PARA ALÉM do canto oposto (30,25) —
    // qualquer direção funciona (o "lado oposto" é o novo tamanho).
    estadoMapa.fonte = { setData: vi.fn() }
    fireEvent.mouseDown(screen.getByTestId('alca-0'))
    fireEvent.mouseMove(window, { clientX: 50, clientY: 40 })
    fireEvent.mouseUp(window)

    const anel = JSON.parse(
      container.getAttribute('data-poligono-desenhado') as string,
    ).coordinates[0] as number[][]
    retanguloValido(anel)
    // Canto oposto ANCORADO no lugar e o cursor no canto puxado.
    expect(anel).toContainEqual([30, 25])
    expect(anel).toContainEqual([50, 40])
    expect(
      JSON.parse(container.getAttribute('data-poligono-desenhado') as string).coordinates[0],
    ).toEqual([[50, 40], [50, 25], [30, 25], [30, 40], [50, 40]])
  })

  it('polígono LIVRE de 5 vértices mantém o movimento de vértice (sem regressão)', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    const container = screen.getByTestId('mapa-container')
    // 5 alvos convexos → hull mantém todos → anel fechado de 6 pontos.
    fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
    fireEvent.mouseMove(container, { clientX: 25, clientY: 8 })
    fireEvent.mouseMove(container, { clientX: 30, clientY: 20 })
    fireEvent.mouseMove(container, { clientX: 20, clientY: 30 })
    fireEvent.mouseMove(container, { clientX: 5, clientY: 25 })
    fireEvent.mouseUp(container)

    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    const hull = convexHull([[10, 10], [25, 8], [30, 20], [20, 30], [5, 25]])
    expect(hull).toHaveLength(5)
    // 5 alças — NÃO virou retângulo (governo por canto), continua vértice.
    expect(screen.getByTestId('alca-4')).toBeInTheDocument()
    expect(screen.queryByTestId('alca-5')).not.toBeInTheDocument()

    estadoMapa.fonte = { setData: vi.fn() }
    fireEvent.mouseDown(screen.getByTestId('alca-2'))
    fireEvent.mouseMove(window, { clientX: 40, clientY: 10 })
    fireEvent.mouseUp(window)

    const esperado = [...hull, hull[0]].map((ponto, indice) =>
      indice === 2 ? [40, 10] : ponto,
    )
    expect(
      JSON.parse(container.getAttribute('data-poligono-desenhado') as string).coordinates[0],
    ).toEqual(esperado)
  })
})
