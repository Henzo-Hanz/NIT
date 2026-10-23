import { useEffect, useRef, useState } from 'react'
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

const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY as string | undefined

const tiles = CARTO_KEY
  ? [
      'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    ]
  : [
      'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
    ]

const estilo = {
  version: 8 as const,
  sources: {
    basemap: {
      type: 'raster' as const,
      tiles: CARTO_KEY
        ? tiles.map((t) => `${t}?key=${CARTO_KEY}`)
        : tiles,
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

const TIPO_POR_CAMADA: Record<string, TipoGeometria> = {
  'camada-pontos': 'ponto',
  'camada-linhas': 'linha',
  'camada-poligonos': 'poligono',
}

interface MapViewProps {
  camadasAtivas?: Record<TipoGeometria, boolean>
  onAbrirEspecie?: (slug: string) => void
  modalAberto?: boolean
}

export function MapView({
  camadasAtivas = { ponto: true, linha: true, poligono: true },
  onAbrirEspecie,
  modalAberto = false,
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
      style: estilo,
      center: CENTRO_LITORAL_PI,
      zoom: ZOOM_INICIAL,
      attributionControl: false,
    })
    mapRef.current = map
    map.on('error', () => setErro(true))
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
  }, [])

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
      el.textContent = '🦀'
      el.className =
        'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-primary text-lg shadow-md'
      el.addEventListener('click', () => {
        const ponto = map.project(coordenada)
        setPosBolha({ x: ponto.x, y: ponto.y })
        bolhaRef.current = true
        setBolhaAberta(true)
      })
      pinRef.current = new Marker({ element: el }).setLngLat(coordenada).addTo(map)
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
          className="absolute z-30 w-64 rounded-2xl border bg-background p-3 shadow-xl -translate-x-1/2"
          style={{ left: posBolha.x, top: posBolha.y - 48 }}
        >
          {listagemAberta ? (
            <div data-testid="lista-especies-bolha">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Caranguejos do litoral
              </h3>
              <ul className="flex flex-col gap-1">
                {(especies ?? []).map((item) => (
                  <li key={item.slug}>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`especie-opcao-${item.slug}`}
                      className="w-full justify-start"
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
            <>
              <p className="text-sm font-medium leading-snug">{contagemParnaiba}</p>
              <Button
                variant="outline"
                size="sm"
                data-testid="ver-especies"
                className="mt-2 w-full"
                onClick={abrirLista}
              >
                Ver espécies ▾
              </Button>
            </>
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
