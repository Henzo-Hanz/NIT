import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    project = vi.fn((coordenadas: [number, number]) => ({
      x: coordenadas[0] * 2,
      y: coordenadas[1] * 2,
    }))
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

const ESPECIES_AREA = [
  { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 2 },
  { slug: 'guaiamum', nome_popular: 'Guaiamum', contagem: 1 },
]

const PONTOS = [
  {
    type: 'Feature',
    properties: {
      id: 1,
      nome: 'Jericoacoara',
      descricao: '2 espécies encontradas',
      especie_slugs: ['caranguejo-uca', 'guaiamum'],
      total: 2,
    },
    geometry: { type: 'Point', coordinates: [100, 60] },
  },
  {
    type: 'Feature',
    properties: {
      id: 2,
      nome: 'Camocim',
      descricao: '1 espécie encontrada',
      especie_slugs: ['caranguejo-uca'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [200, 80] },
  },
]

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    if (String(entrada) === '/api/consulta/area/') {
      return {
        ok: true,
        json: async () => ({
          especies: ESPECIES_AREA,
          pontos: { type: 'FeatureCollection', features: PONTOS },
        }),
      }
    }
    return { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  estadoMapa.instancias.length = 0
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// Lapidação 4: a medição nasce SÓ de pontos. O clique livre NÃO mede mais —
// mostra o aviso curto (dica-medir).
describe('CA-7: medir por pontos (sem clique livre)', () => {
  it('o clique livre não mede: aparece a dica-medir e ela some sozinha', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })

    await usuario.click(screen.getByTestId('ferramenta-medir'))
    const container = screen.getByTestId('mapa-container')
    fireEvent.click(container, { clientX: 100, clientY: 120 })
    expect(screen.queryByTestId('linha-medida')).toBeNull()
    expect(screen.queryByTestId('distancia-medida')).toBeNull()
    expect(screen.getByTestId('dica-medir')).toBeInTheDocument()

    // Some sozinha após ~1,6s (com folga para o setInterval do waitFor).
    await vi.waitFor(
      () => {
        expect(screen.queryByTestId('dica-medir')).toBeNull()
      },
      { timeout: 2500 },
    )
  })

  it('A no 1º ponto, B no 2º com linha + km e o 3º ponto reinicia', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })

    await usuario.click(screen.getByTestId('ferramenta-medir'))
    expect(screen.getByTestId('ferramenta-medir')).toHaveAttribute('aria-pressed', 'true')

    const pontos = screen.getAllByTestId('ponto-area')
    await usuario.click(pontos[0])
    expect(pontos[0]).toHaveAttribute('data-medida', 'a')
    expect(screen.queryByTestId('linha-medida')).toBeNull()

    await usuario.click(pontos[1])
    const linha = screen.getByTestId('linha-medida')
    expect(linha).toBeInTheDocument()
    expect(linha.getAttribute('stroke-dasharray')).toBeTruthy()
    expect(linha.getAttribute('x1')).toBe('200')
    expect(linha.getAttribute('y1')).toBe('120')
    expect(linha.getAttribute('x2')).toBe('400')
    expect(linha.getAttribute('y2')).toBe('160')
    expect(screen.getByTestId('distancia-medida')).toHaveTextContent(/km/)

    // 3º ponto (uma nova rodada): reinicia a medição.
    await usuario.click(pontos[0])
    expect(screen.queryByTestId('linha-medida')).toBeNull()
    expect(screen.queryByTestId('distancia-medida')).toBeNull()
    expect(screen.getAllByTestId('ponto-area')[0]).toHaveAttribute('data-medida', 'a')
  })

  it('a tecla ESC limpa a medição por pontos', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)
    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })

    await usuario.click(screen.getByTestId('ferramenta-medir'))
    const pontos = screen.getAllByTestId('ponto-area')
    await usuario.click(pontos[0])
    await usuario.click(pontos[1])
    expect(screen.getByTestId('linha-medida')).toBeInTheDocument()

    await usuario.keyboard('{Escape}')
    expect(screen.queryByTestId('linha-medida')).toBeNull()
    expect(screen.queryByTestId('distancia-medida')).toBeNull()
    expect(screen.getAllByTestId('ponto-area')[0]).not.toHaveAttribute('data-medida')
  })
})
