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

const bboxDoAnel = (anel: number[][]) => {
  const xs = anel.slice(0, -1).map((ponto) => ponto[0])
  const ys = anel.slice(0, -1).map((ponto) => ponto[1])
  return {
    largura: Math.max(...xs) - Math.min(...xs),
    altura: Math.max(...ys) - Math.min(...ys),
  }
}

async function desenharElipse(usuario: ReturnType<typeof userEvent.setup>) {
  render(<MapView />)
  await usuario.click(screen.getByTestId('ferramenta-desenhar'))
  await usuario.click(screen.getByTestId('desenho-circulo'))
  const container = screen.getByTestId('mapa-container')
  // Elipse: centro [10,10], rx=20, ry=10.
  fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
  fireEvent.mouseMove(container, { clientX: 30, clientY: 20 })
  fireEvent.mouseUp(container)
  await vi.waitFor(() => {
    expect(screen.getByTestId('area-item-1')).toBeInTheDocument()
  })
  await usuario.click(screen.getByTestId('ferramenta-arrastar'))
  return container
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  estadoMapa.fonte = null
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// CA-8: arrastar a partir do centroide (onde fica o rótulo area-tamanho) move
// a elipse inteira — anel e modelo.centro transladam juntos, sem virar
// redimensionamento. O rótulo é pointer-events-none para não bloquear o gesto.
describe('CA-8: mover círculo/elipse livremente pelo interior', () => {
  it('arraste no centroide translada anel e modelo sem redimensionar', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    const fonte = { setData: vi.fn() }
    estadoMapa.fonte = fonte
    const container = await desenharElipse(usuario)

    const original = anelDaElipse([10, 10], 20, 10)
    expect(JSON.parse(container.getAttribute('data-poligono-desenhado') as string).coordinates[0])
      .toEqual(original)

    // O rótulo fica sobre o centroide, mas não captura mouse.
    const rotulo = screen.getByTestId('area-tamanho')
    expect(rotulo).toBeInTheDocument()
    expect(rotulo).toHaveClass('pointer-events-none')

    // mousedown no centroide (mesmo ponto do rótulo) inicia o mover.
    fireEvent.mouseDown(container, { clientX: 10, clientY: 10 })
    expect(container).toHaveAttribute('data-editando', 'true')

    // Gesto pela janela: translação (+5, +3).
    fireEvent.mouseMove(window, { clientX: 15, clientY: 13 })
    expect(container).toHaveAttribute('data-editando', 'true')
    const aoVivo = fonte.setData.mock.calls.at(-1)?.[0].features[0].geometry.coordinates[0]
    expect(aoVivo).toEqual(anelDaElipse([15, 13], 20, 10))

    fireEvent.mouseUp(window)
    expect(container).not.toHaveAttribute('data-editando')

    const movido = JSON.parse(container.getAttribute('data-poligono-desenhado') as string)
      .coordinates[0] as number[][]
    // Centro/modelo transladado e forma preservada (mesmos raios).
    expect(movido).toEqual(anelDaElipse([15, 13], 20, 10))
    expect(bboxDoAnel(movido)).toEqual(bboxDoAnel(original))

    // Alças acompanham o novo centro.
    expect(screen.getByTestId('alca-0').getAttribute('cx')).toBe('35')
    expect(screen.getByTestId('alca-0').getAttribute('cy')).toBe('13')

    // A consulta re-dispara com o anel novo.
    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      expect(chamadas.length).toBeGreaterThanOrEqual(2)
      expect(
        JSON.parse(String(chamadas[chamadas.length - 1][1].body)).poligono.coordinates[0],
      ).toEqual(anelDaElipse([15, 13], 20, 10))
    })
  })
})