import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'

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

const ESPECIES_SEM_FOTO = [
  {
    slug: 'guaiamum',
    nome_popular: 'Guaiamum',
    nome_cientifico: 'Cardisoma guanhumi',
    imagem: '',
  },
]

const FICHA_GUAIAMUM = {
  slug: 'guaiamum',
  nome_popular: 'Guaiamum',
  nome_cientifico: 'Cardisoma guanhumi',
  descricao: 'O guaiamum é um caranguejo terrestre de manguezais.',
  infos: { habitat: 'Manguezal e apicum' },
  imagem: '',
}

function configurarFetch() {
  const fetchFake = vi.fn(async (entrada: RequestInfo | URL) => {
    const rota = String(entrada)
    if (rota === '/api/especies/') {
      return { ok: true, json: async () => ESPECIES_SEM_FOTO }
    }
    if (rota === '/api/especies/guaiamum/') {
      return { ok: true, json: async () => FICHA_GUAIAMUM }
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

describe('CA-8: espécie sem foto usa o fallback da silhueta', () => {
  it('o card usa o fallback /icone/ e não pede a foto que não existe', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<App />)

    await usuario.click(screen.getByTestId('nav-espécies'))
    const card = await screen.findByTestId('card-especie-guaiamum')
    const fallback = within(card).getByTestId('foto-especie-fallback')
    expect(fallback).toHaveAttribute('src', '/api/especies/guaiamum/icone/')
    expect(card.querySelector('img[src*="/imagem/"]')).toBeNull()
  })

  it('a ficha abre com o fallback e os textos da espécie', async () => {
    const usuario = userEvent.setup()
    configurarFetch()
    render(<App />)

    await usuario.click(screen.getByTestId('nav-espécies'))
    await usuario.click(await screen.findByTestId('card-especie-guaiamum'))

    const modal = await screen.findByTestId('modal-especie')
    expect(within(modal).getByTestId('foto-especie-fallback')).toHaveAttribute(
      'src',
      '/api/especies/guaiamum/icone/',
    )
    expect(within(modal).queryByTestId('foto-especie')).toBeNull()
    expect(screen.getByTestId('nome-popular-modal')).toHaveTextContent('Guaiamum')
    expect(screen.getByTestId('descricao-especie')).toHaveTextContent(
      'caranguejo terrestre de manguezais',
    )
  })
})
