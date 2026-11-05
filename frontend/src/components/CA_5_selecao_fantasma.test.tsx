import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapView } from './MapView'

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

const corpoDaConsulta = (chamada: any[]) => JSON.parse(String(chamada[1].body))

const borracha = () => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  estadoMapa.fonte = null
  vi.unstubAllGlobals()
  vi.clearAllMocks()
}

afterEach(borracha)

async function desenharTriangulo(usuario: ReturnType<typeof userEvent.setup>) {
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
  return container
}

// Lapidação 10: seleção de área com estado VISÍVEL distinto (data-selecionada +
// destaque âmbar no painel e no polígono) e desenho AO VIVO na edição — o anel
// editado é empurrado direto na fonte 'area-desenhada' (setData) conforme o
// vértice/lugar se move; a gravação definitiva só acontece ao soltar.
describe('CA-5: seleção de área e desenho ao vivo na edição', () => {
  it('clicar na área no painel marca SELECIONADA no painel e no polígono', async () => {
    const usuario = userEvent.setup()
    const container = await desenharTriangulo(usuario)
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))
    await usuario.click(screen.getByTestId('selecionar-area-1'))

    const item = screen.getByTestId('area-item-1')
    expect(item).toHaveAttribute('data-selecionada', 'true')
    expect(item).toHaveClass('border-amber-500', 'dark:border-amber-400')
    expect(screen.getByTestId('alcas-area')).toHaveAttribute('data-selecionada', 'true')

    // Clique fora de QUALQUER área ((60,60) está fora do triângulo) desmarca.
    fireEvent.click(container, { clientX: 60, clientY: 60 })
    expect(item).toHaveAttribute('data-selecionada', 'false')
    expect(screen.getByTestId('alcas-area')).toHaveAttribute('data-selecionada', 'false')
  })

  it('alternar ferramenta desmarca a área selecionada', async () => {
    const usuario = userEvent.setup()
    await desenharTriangulo(usuario)
    await usuario.click(screen.getByTestId('selecionar-area-1'))
    expect(screen.getByTestId('area-item-1')).toHaveAttribute('data-selecionada', 'true')

    await usuario.click(screen.getByTestId('ferramenta-medir'))
    expect(screen.getByTestId('area-item-1')).toHaveAttribute('data-selecionada', 'false')
  })

  it('o desenho acompanha o mover AO VIVO via setData e grava o polígono só ao soltar', async () => {
    const usuario = userEvent.setup()
    const fetchFake = configurarFetch()
    const fonte = { setData: vi.fn() }
    estadoMapa.fonte = fonte
    const container = await desenharTriangulo(usuario)
    await usuario.click(screen.getByTestId('ferramenta-arrastar'))

    // Sem fantasma SVG: o desenho ao vivo acontece na fonte do próprio mapa.
    expect(screen.queryByTestId('fantasma-area')).toBeNull()

    // (18,12) está dentro do triângulo: começa o mover.
    fireEvent.mouseDown(container, { clientX: 18, clientY: 12 })
    expect(container).toHaveAttribute('data-editando', 'true')

    // DURANTE o gesto: o estado `areas` NÃO muda (o polígono gravado segue antigo).
    const anelGravado = container.getAttribute('data-poligono-desenhado') as string
    const chamadasAntes = fonte.setData.mock.calls.length
    fireEvent.mouseMove(window, { clientX: 23, clientY: 17 }) // translação (+5,+5)
    expect(container.getAttribute('data-poligono-desenhado')).toBe(anelGravado)

    // AO VIVO: setData com TODAS as áreas, a editada pelo anel transladado.
    expect(fonte.setData.mock.calls.length).toBeGreaterThan(chamadasAntes)
    const dadosAoVivo = fonte.setData.mock.calls.at(-1)?.[0]
    expect(dadosAoVivo.type).toBe('FeatureCollection')
    expect(dadosAoVivo.features).toHaveLength(1)
    expect(dadosAoVivo.features[0].properties).toEqual({ id: '1', nome: 'Área 1', ativa: false })
    expect(dadosAoVivo.features[0].geometry.coordinates[0]).toEqual([
      [15, 15],
      [35, 15],
      [25, 25],
      [15, 15],
    ])

    // Ao soltar: gravação definitiva no estado `areas` (idempotente na fonte).
    fireEvent.mouseUp(window)
    expect(container).not.toHaveAttribute('data-editando')
    const movido = JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [
          [15, 15],
          [35, 15],
          [25, 25],
          [15, 15],
        ],
      ],
    })
    await vi.waitFor(() => {
      expect(container.getAttribute('data-poligono-desenhado')).toBe(movido)
    })
    const dadosFinal = fonte.setData.mock.calls.at(-1)?.[0]
    expect(dadosFinal.features[0].geometry.coordinates[0]).toEqual([
      [15, 15],
      [35, 15],
      [25, 25],
      [15, 15],
    ])

    // A reconsulta recebe o polígono novo.
    await vi.waitFor(() => {
      const chamadas = consultas(fetchFake)
      expect(chamadas.length).toBeGreaterThanOrEqual(2)
      expect(corpoDaConsulta(chamadas[chamadas.length - 1]).poligono.coordinates[0]).toEqual([
        [15, 15],
        [35, 15],
        [25, 25],
        [15, 15],
      ])
    })
  })
})
