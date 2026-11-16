import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapView } from './MapView'
import { anelDaElipse } from '@/utils/geo'

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
    // Convenção MapLibre: lat cresce para cima, a TELA cresce para baixo —
    // o mock espelha o Y (clientY = -lat) como o mapa real.
    project = vi.fn((coordenadas: [number, number]) => ({ x: coordenadas[0], y: -coordenadas[1] }))
    unproject = vi.fn(([x, y]: [number, number]) => [x, -y])
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

const anelGravado = (container: HTMLElement) =>
  JSON.parse(container.getAttribute('data-poligono-desenhado') as string)
    .coordinates[0] as number[][]

const clicar = (container: HTMLElement, x: number, y: number) => {
  fireEvent.mouseDown(container, { clientX: x, clientY: y })
  fireEvent.mouseUp(window)
  fireEvent.click(container, { clientX: x, clientY: y })
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  estadoMapa.fonte = null
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// CA-9: alça de rotação (ponto + reta até o centro). Arrastar gira a área em
// tempo real NO SENTIDO do ponteiro; a alça ORBITA com a forma. Soltar grava
// no estado (e no histórico). Elipse persiste o ângulo; unir a elipse com a
// rotação troca os eixos após 90°.
describe('CA-9: rotação da área pela alça', () => {
  it('gira a elipse ~90° no sentido do arraste, grava, permite undo e some ao desmarcar', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    const fonte = { setData: vi.fn() }
    estadoMapa.fonte = fonte
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))
    await usuario.click(screen.getByTestId('desenho-circulo'))

    const container = screen.getByTestId('mapa-container')
    // Elipse: centro [10,10], rx=20, ry=10 (clientY = -lat).
    fireEvent.mouseDown(container, { clientX: 10, clientY: -10 })
    fireEvent.mouseMove(container, { clientX: 30, clientY: -20 })
    fireEvent.mouseUp(container)
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    // CA-7: trocar de ferramenta desmarca; seleciona DEPOIS de entrar em arrastar.
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))
    await usuario.click(screen.getByTestId('selecionar-area-1'))

    const original = anelDaElipse([10, 10], 20, 10)
    expect(anelGravado(container)).toEqual(original)

    // Alça + reta existem com a área ativa.
    const alca = screen.getByTestId('alca-rotacao')
    const linha = screen.getByTestId('linha-rotacao')
    expect(alca).toBeInTheDocument()
    expect(linha).toBeInTheDocument()
    // Alça na ponta do eixo N (+28px na direção do raio) e reta até o centro:
    // topo da elipse em tela é (10,-20), alça em (10,-48).
    expect(Number(alca.getAttribute('cx'))).toBeCloseTo(10, 6)
    expect(Number(alca.getAttribute('cy'))).toBeCloseTo(-48, 6)
    expect(Number(linha.getAttribute('x1'))).toBeCloseTo(10, 6)
    expect(Number(linha.getAttribute('y1'))).toBeCloseTo(-10, 6)
    expect(Number(linha.getAttribute('x2'))).toBeCloseTo(10, 6)
    expect(Number(linha.getAttribute('y2'))).toBeCloseTo(-48, 6)

    // Vetor centro→alça aponta para cima (ângulo +90° matemático); arrastar
    // para a direita (ângulo 0°) aplica delta −90°: a forma gira no SENTIDO
    // do ponteiro (horário na tela).
    fireEvent.mouseDown(alca, { clientX: 10, clientY: -48 })
    expect(container).toHaveAttribute('data-editando', 'true')
    fireEvent.mouseMove(window, { clientX: 48, clientY: -10 })
    // AO VIVO: o anel rotacionado já vai para a fonte do mapa.
    const aoVivo = fonte.setData.mock.calls.at(-1)?.[0].features[0].geometry.coordinates[0]
    expect(aoVivo).toEqual(anelDaElipse([10, 10], 20, 10, 32, -Math.PI / 2))
    // A alça ACOMPANHA o giro: após −90° ela está à DIREITA do centro, na
    // mesma direção do ponteiro (não mais fixa em minY−28).
    expect(Number(alca.getAttribute('cx'))).toBeCloseTo(48, 6)
    expect(Number(alca.getAttribute('cy'))).toBeCloseTo(-10, 6)
    fireEvent.mouseUp(window)
    expect(container).not.toHaveAttribute('data-editando')

    const girado = anelDaElipse([10, 10], 20, 10, 32, -Math.PI / 2)
    expect(anelGravado(container)).toEqual(girado)
    // Eixos trocados: a extremidade que era E agora aponta para o S.
    expect(girado[0][0]).toBeCloseTo(10, 6)
    expect(girado[0][1]).toBeCloseTo(-10, 6)

    // Ctrl+Z restaura o anel anterior (rotação entrou no histórico).
    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
    await vi.waitFor(() => {
      expect(anelGravado(container)).toEqual(original)
    })

    // Desmarcar remove alça e reta de rotação.
    clicar(container, 60, 60)
    expect(screen.queryByTestId('alca-rotacao')).toBeNull()
    expect(screen.queryByTestId('linha-rotacao')).toBeNull()
  })

  it('gira também um polígono livre em torno do centro do bbox', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await usuario.click(screen.getByTestId('ferramenta-desenhar'))

    const container = screen.getByTestId('mapa-container')
    fireEvent.mouseDown(container, { clientX: 10, clientY: -10 })
    fireEvent.mouseMove(container, { clientX: 30, clientY: -10 })
    fireEvent.mouseMove(container, { clientX: 20, clientY: -20 })
    fireEvent.mouseUp(container)
    await vi.waitFor(() => {
      expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
    })
    // CA-7: trocar de ferramenta desmarca; seleciona DEPOIS de entrar em arrastar.
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))
    await usuario.click(screen.getByTestId('selecionar-area-1'))

    const original = anelGravado(container)
    const antes = screen.getByTestId('alca-rotacao')
    fireEvent.mouseDown(antes, {
      clientX: 20,
      clientY: Number(antes.getAttribute('cy')),
    })
    // −90°: arraste até a direita do centro do bbox ([20,15]) — sentido
    // horário visual, o mesmo lado do ponteiro.
    fireEvent.mouseMove(window, { clientX: 43, clientY: -15 })
    // A alça orbita: sai de cima e vai para a DIREITA do centro (mesmo raio).
    expect(Number(antes.getAttribute('cx'))).toBeCloseTo(53, 6)
    expect(Number(antes.getAttribute('cy'))).toBeCloseTo(-15, 6)
    fireEvent.mouseUp(window)

    const girado = anelGravado(container)
    const centro: [number, number] = [20, 15]
    original.forEach((ponto, indice) => {
      const dx = ponto[0] - centro[0]
      const dy = ponto[1] - centro[1]
      // Rotação de −90° (horário na tela): (dx,dy) -> (dy,−dx).
      expect(girado[indice][0]).toBeCloseTo(centro[0] + dy, 6)
      expect(girado[indice][1]).toBeCloseTo(centro[1] - dx, 6)
    })
    // Rotação não altera a área em km².
    expect(screen.getByTestId('area-tamanho')).toBeInTheDocument()
  })
})
