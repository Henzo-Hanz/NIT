import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ArrowLeft, X } from 'lucide-react'
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Button } from '@/components/ui/button'
import {
  buscarGeometrias,
  buscarEspecies,
  type FeatureCollectionGeometrias,
  type EspecieResumo,
  type TipoGeometria,
} from '@/lib/api'

export const CENTRO_LITORAL_PI: [number, number] = [-41.75, -2.9]
export const ZOOM_INICIAL = 6

const TILES_VOYAGER = [
  'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
]

function conectarFallbackDoIcone(pin: HTMLElement, icone: Element) {
  const mostrarFallback = () => {
    icone.remove()
    pin
      .querySelectorAll('[data-fallback-crab], [data-fallback-crab-patas], [data-fallback-crab-olho]')
      .forEach((parte) => {
        ;(parte as HTMLElement).removeAttribute('style')
      })
  }
  icone.addEventListener('error', mostrarFallback)
}

function construirEstilo(apiKey: string | undefined) {
  const tiles = apiKey
    ? TILES_VOYAGER.map((tile) => `${tile}?key=${apiKey}`)
    : TILES_VOYAGER
  return {
    version: 8 as const,
    sources: {
      basemap: {
        type: 'raster' as const,
        tiles,
        tileSize: 256,
        attribution: '© OpenStreetMap © CARTO',
      },
    },
    layers: [
      {
        id: 'basemap',
        type: 'raster' as const,
        source: 'basemap',
      },
    ],
  }
}

const TIPO_POR_CAMADA: Record<string, TipoGeometria> = {
  'camada-pontos': 'ponto',
  'camada-linhas': 'linha',
  'camada-poligonos': 'poligono',
}

interface MapViewProps {
  camadasAtivas?: Record<TipoGeometria, boolean>
  onAbrirEspecie?: (slug: string) => void
  modalAberto?: boolean
  abrirListagemEm?: number
}

export function MapView({
  camadasAtivas = { ponto: true, linha: true, poligono: true },
  onAbrirEspecie,
  modalAberto = false,
  abrirListagemEm = 0,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const pinRef = useRef<Marker | null>(null)
  const coordenadaRef = useRef<[number, number] | null>(null)
  const bolhaRef = useRef(false)
  const fonteProntaRef = useRef(false)
  const [carregado, setCarregado] = useState(false)
  const [fontePronta, setFontePronta] = useState(false)
  const [geometrias, setGeometrias] = useState<FeatureCollectionGeometrias | null>(null)
  const [bolhaAberta, setBolhaAberta] = useState(false)
  const [listagemAberta, setListagemAberta] = useState(false)
  const [especies, setEspecies] = useState<EspecieResumo[] | null>(null)
  const [posBolha, setPosBolha] = useState<{ x: number; y: number } | null>(null)
  const [erro, setErro] = useState(false)
  const cartoKey = import.meta.env.VITE_CARTO_API_KEY as string | undefined
  const [estiloAtual, setEstiloAtual] = useState(() => construirEstilo(cartoKey))
  const [reiniciar, setReiniciar] = useState(0)
  const podeTentarSemKey = useRef(Boolean(cartoKey))

  useEffect(() => {
    let vivo = true
    buscarGeometrias().then((dados) => {
      if (vivo) {
        setGeometrias(dados)
      }
    })
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }
    const map = new MapLibreMap({
      container: containerRef.current,
      style: estiloAtual,
      center: CENTRO_LITORAL_PI,
      zoom: ZOOM_INICIAL,
      attributionControl: false,
    })
    mapRef.current = map
    map.on('error', () => {
      if (podeTentarSemKey.current) {
        podeTentarSemKey.current = false
        setEstiloAtual(construirEstilo(undefined))
        setReiniciar((atual) => atual + 1)
        return
      }
      setErro(true)
    })
    map.on('load', () => setCarregado(true))
    map.on('move', () => {
      if (bolhaRef.current && coordenadaRef.current) {
        const ponto = map.project(coordenadaRef.current)
        setPosBolha({ x: ponto.x, y: ponto.y })
      }
    })
    return () => {
      pinRef.current?.remove()
      pinRef.current = null
      fonteProntaRef.current = false
      map.remove()
      mapRef.current = null
      setCarregado(false)
      setFontePronta(false)
      setBolhaAberta(false)
      setListagemAberta(false)
      setPosBolha(null)
    }
  }, [reiniciar, estiloAtual])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !carregado || !geometrias || fonteProntaRef.current) {
      return
    }
    fonteProntaRef.current = true
    map.addSource('geometrias', { type: 'geojson', data: geometrias })
    const camadas = [
      {
        id: 'camada-pontos',
        tipo: 'ponto',
        tipoLayer: 'circle',
        paint: {
          'circle-radius': 6,
          'circle-color': '#0f766e',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      },
      {
        id: 'camada-linhas',
        tipo: 'linha',
        tipoLayer: 'line',
        paint: { 'line-width': 2, 'line-color': '#0f766e' },
      },
      {
        id: 'camada-poligonos',
        tipo: 'poligono',
        tipoLayer: 'fill',
        paint: {
          'fill-color': '#0ea5a4',
          'fill-opacity': 0.2,
          'fill-outline-color': '#0f766e',
        },
      },
    ] as { id: string; tipo: TipoGeometria; tipoLayer: 'circle' | 'line' | 'fill'; paint: Record<string, unknown> }[]
    for (const camada of camadas) {
      map.addLayer({
        id: camada.id,
        type: camada.tipoLayer,
        source: 'geometrias',
        filter: ['==', ['get', 'tipo'], camada.tipo],
        paint: camada.paint,
      } as never)
    }
    const pontoParanaiba = geometrias.features.find(
      (feature) => feature.properties.nome === 'Parnaíba',
    )
    if (pontoParanaiba && pontoParanaiba.geometry.type === 'Point') {
      const coordenada = pontoParanaiba.geometry.coordinates as [number, number]
      coordenadaRef.current = coordenada
      const el = document.createElement('button')
      el.type = 'button'
      el.setAttribute('data-testid', 'pin-parnaiba')
      el.setAttribute('aria-label', 'Parnaíba')
      el.className = 'relative cursor-pointer select-none'
      el.innerHTML =
        '<svg width="46" height="62" viewBox="0 0 34 46" class="drop-shadow-md">' +
        '<path d="M17 1C8.2 1 1 8.2 1 17c0 7.41 6.49 15.33 12.39 21.83C14.39 42.83 15.63 44 17 44s2.61-1.17 3.61-2.17C26.51 32.33 33 24.41 33 17 33 8.2 25.8 1 17 1Z" class="fill-destructive"/>' +
        '<circle cx="17" cy="17" r="10" class="fill-white"/>' +
        '<image data-icono-phylopic x="7" y="9.5" width="20" height="15" href="/api/especies/caranguejo-uca/icone/"/>' +
        '<g data-fallback-crab class="fill-destructive" style="display: none">' +
        '<circle cx="12" cy="12.65" r="2.1"/><circle cx="22" cy="12.65" r="2.1"/>' +
        '<ellipse cx="17" cy="17.75" rx="4.5" ry="3.1"/>' +
        '</g>' +
        '<g data-fallback-crab-patas class="stroke-destructive" fill="none" stroke-width="1.5" stroke-linecap="round" style="display: none">' +
        '<path d="M13.6 15.35Q12.6 14.35 12.2 13.25"/>' +
        '<path d="M20.4 15.35Q21.4 14.35 21.8 13.25"/>' +
        '<path d="M13.5 18.95 10.6 20.55"/>' +
        '<path d="M20.5 18.95 23.4 20.55"/>' +
        '<path d="M13.2 19.95 10.9 22.2"/>' +
        '<path d="M20.8 19.95 23.1 22.2"/>' +
        '<path d="M13.4 20.75 11.6 23.45"/>' +
        '<path d="M23.4 20.75 22.4 23.45"/>' +
        '</g>' +
        '<circle data-fallback-crab-olho cx="15.3" cy="16.05" r="0.75" class="fill-white" style="display: none"/>' +
        '<circle data-fallback-crab-olho cx="18.7" cy="16.05" r="0.75" class="fill-white" style="display: none"/>' +
        '</svg>'
      const iconoPhylopic = el.querySelector('image[data-icono-phylopic]')
      if (iconoPhylopic) {
        conectarFallbackDoIcone(el, iconoPhylopic)
      }
      el.addEventListener('click', () => {
        const ponto = map.project(coordenada)
        setPosBolha({ x: ponto.x, y: ponto.y })
        bolhaRef.current = true
        setBolhaAberta(true)
      })
      pinRef.current = new Marker({ element: el, anchor: 'bottom' }).setLngLat(coordenada).addTo(map)
    }
    setFontePronta(true)
  }, [carregado, geometrias])

  useEffect(() => {
    bolhaRef.current = bolhaAberta && !modalAberto
  }, [bolhaAberta, modalAberto])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !fontePronta) {
      return
    }
    for (const [idCamada, tipo] of Object.entries(TIPO_POR_CAMADA)) {
      map.setLayoutProperty(idCamada, 'visibility', camadasAtivas[tipo] ? 'visible' : 'none')
    }
  }, [fontePronta, camadasAtivas])

  const abrirLista = async () => {
    const dados = await buscarEspecies()
    setEspecies(dados)
    setListagemAberta(true)
  }

  const fecharBolha = () => {
    bolhaRef.current = false
    setBolhaAberta(false)
    setListagemAberta(false)
  }

  useEffect(() => {
    if (!abrirListagemEm) {
      return
    }
    let vivo = true
    buscarEspecies().then((dados) => {
      if (!vivo) {
        return
      }
      setEspecies(dados)
      bolhaRef.current = true
      setBolhaAberta(true)
      setListagemAberta(true)
    })
    return () => {
      vivo = false
    }
  }, [abrirListagemEm])

  useEffect(() => {
    if (!bolhaAberta || modalAberto) {
      return
    }
    const aoTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        fecharBolha()
      }
    }
    document.addEventListener('keydown', aoTeclear)
    return () => document.removeEventListener('keydown', aoTeclear)
  }, [bolhaAberta, modalAberto])

  const comMapa = (acao: (map: MapLibreMap) => void) => () => {
    if (mapRef.current) {
      acao(mapRef.current)
    }
  }

  const pontoParanaiba = geometrias?.features.find(
    (feature) => feature.properties.nome === 'Parnaíba',
  )
  const contagemParnaiba = pontoParanaiba?.properties.descricao ?? ''

  return (
    <div data-testid="mapa" className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      {erro && (
        <div
          data-testid="mapa-erro"
          className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground"
        >
          <p className="rounded-lg bg-background px-6 py-4 text-sm shadow">
            Mapa indisponível no momento. Verifique sua conexão e recarregue a página.
          </p>
        </div>
      )}
      {bolhaAberta && !modalAberto && posBolha && (
        <div
          data-testid="bolha-parnaiba"
          className="absolute z-30 w-72 -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
          style={{ left: posBolha.x, top: posBolha.y - 56 }}
        >
          <button
            type="button"
            data-testid="fechar-bolha"
            aria-label="Fechar bolha"
            className="absolute right-1.5 top-1.5 z-10 rounded-md bg-background/80 p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={fecharBolha}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
          {listagemAberta ? (
            <div data-testid="lista-especies-bolha">
              <div className="flex items-center gap-1 bg-primary px-3 py-2 text-primary-foreground">
                <button
                  type="button"
                  data-testid="bolha-voltar"
                  aria-label="Voltar para a contagem"
                  className="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-primary-foreground/15 focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:outline-none"
                  onClick={() => setListagemAberta(false)}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                </button>
                <h3 className="flex-1 truncate text-xs font-bold uppercase tracking-wide">
                  Caranguejos do litoral
                </h3>
              </div>
              <ul className="flex max-h-56 flex-col overflow-y-auto p-2 no-scrollbar">
                {(especies ?? []).map((item) => (
                  <li key={item.slug}>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`especie-opcao-${item.slug}`}
                      className="w-full justify-start rounded-lg hover:bg-accent"
                      onClick={() => {
                        fecharBolha()
                        onAbrirEspecie?.(item.slug)
                      }}
                    >
                      {item.nome_popular}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="p-3">
              <p className="text-sm font-medium leading-snug text-foreground">{contagemParnaiba}</p>
              <Button
                variant="default"
                size="sm"
                data-testid="ver-especies"
                className="mt-2 w-full justify-between"
                onClick={abrirLista}
              >
                Ver espécies
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="absolute left-4 top-1/2 flex -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-lg">
        <button
          type="button"
          data-testid="mapa-zoom-in"
          aria-label="Aproximar"
          className="px-3 py-2 text-lg font-bold hover:bg-accent"
          onClick={comMapa((m) => m.zoomIn())}
        >
          +
        </button>
        <button
          type="button"
          data-testid="mapa-zoom-out"
          aria-label="Afastar"
          className="border-t px-3 py-2 text-lg font-bold hover:bg-accent"
          onClick={comMapa((m) => m.zoomOut())}
        >
          −
        </button>
        <button
          type="button"
          data-testid="mapa-reset"
          aria-label="Voltar ao litoral do Piauí"
          className="border-t px-3 py-2 hover:bg-accent"
          onClick={comMapa((m) => m.easeTo({ center: CENTRO_LITORAL_PI, zoom: ZOOM_INICIAL }))}
        >
          ⌖
        </button>
      </div>
    </div>
  )
}
