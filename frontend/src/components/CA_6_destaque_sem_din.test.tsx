/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
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

const ESPECIES_AREA = [
  { slug: 'caranguejo-uca', nome_popular: 'Caranguejo-uçá', contagem: 2 },
  { slug: 'guaiamum', nome_popular: 'Guaiamum', contagem: 1 },
  { slug: 'caranguejo-maria-farinha', nome_popular: 'Caranguejo maria-farinha', contagem: 1 },
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
    geometry: { type: 'Point', coordinates: [-40.513, -2.797] },
  },
  {
    type: 'Feature',
    properties: {
      id: 2,
      nome: 'Camocim',
      descricao: '1 espécie encontrada',
      especie_slugs: ['caranguejo-maria-farinha'],
      total: 1,
    },
    geometry: { type: 'Point', coordinates: [-40.84, -2.9] },
  },
]

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    const rota = String(entrada)
    if (rota === '/api/consulta/area/') {
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

describe('CA-6 lapidação 5: destaque sem mudança de tamanho e pisca só de opacidade', () => {
  it('ao assentar, ponto com a espécie fica grande e o sem a espécie mantém o tamanho neutro esmaecido', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<MapView />)

    await vi.waitFor(() => {
      expect(screen.getAllByTestId('ponto-area')).toHaveLength(2)
    })
    for (const ponto of screen.getAllByTestId('ponto-area')) {
      expect(ponto).not.toHaveAttribute('data-destacado')
      expect(ponto.className).toContain('size-4')
      expect(ponto.className).toContain('bg-teal-600')
    }

    await usuario.click(screen.getByTestId('filtro-especie-guaiamum'))

    // Durante a pisca NENHUM ponto pode mudar de tamanho: a animação é de
    // opacidade apenas e ninguém encolhe/cofira nem recebe size menor.
    await vi.waitFor(() => {
      const pontos = screen.getAllByTestId('ponto-area')
      expect(pontos).toHaveLength(2)
      expect(pontos.every((ponto) => ponto.hasAttribute('data-pisca'))).toBe(true)
    })
    for (const ponto of screen.getAllByTestId('ponto-area')) {
      expect(ponto.className).toContain('ponto-pisca')
      expect(ponto.className).not.toContain('scale')
      expect(ponto.className).not.toContain('size-3')
    }

    // Assoalho (fim da animação — estado final): o que importa é aqui.
    await vi.waitFor(
      () => {
        const pontos = screen.getAllByTestId('ponto-area')
        expect(pontos).toHaveLength(2)
        expect(pontos.every((ponto) => !ponto.hasAttribute('data-pisca'))).toBe(true)
      },
      { timeout: 3000 },
    )

    const pontos = screen.getAllByTestId('ponto-area')
    const casado = pontos.find((ponto) => ponto.getAttribute('aria-label') === 'Jericoacoara')
    const naoCasado = pontos.find((ponto) => ponto.getAttribute('aria-label') === 'Camocim')
    expect(casado).toBeDefined()
    expect(naoCasado).toBeDefined()

    expect(casado).toHaveAttribute('data-destacado', 'true')
    expect(casado?.className).toContain('size-6')
    expect(casado?.className).toContain('bg-amber-500')
    expect(casado?.className).toContain('ring-4')
    expect(casado?.className).toContain('ring-amber-400')
    expect(casado?.className).not.toContain('opacity-40')

    // Não-casado: MESMO tamanho do neutro (size-4), só esmaece — nunca size-3.
    expect(naoCasado).toHaveAttribute('data-destacado', 'false')
    expect(naoCasado?.className).toContain('size-4')
    expect(naoCasado?.className).toContain('opacity-40')
    expect(naoCasado?.className).not.toContain('size-3')
    expect(naoCasado?.className).not.toContain('ponto-pisca')
  })

  it('@keyframes ponto-piscar é animação de opacity APENAS (sem transform/scale)', () => {
    const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8')
    const bloco = css.match(/@keyframes ponto-piscar \{([\s\S]*?)^\}/m)
    expect(bloco).not.toBeNull()
    const corpo = bloco?.[1] ?? ''
    expect(corpo).toContain('opacity')
    expect(corpo).not.toContain('transform')
    expect(corpo).not.toContain('scale')
  })
})
