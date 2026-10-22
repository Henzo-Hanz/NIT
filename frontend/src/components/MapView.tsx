import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

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

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [erro, setErro] = useState(false)

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
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  const comMapa = (acao: (map: MapLibreMap) => void) => () => {
    if (mapRef.current) {
      acao(mapRef.current)
    }
  }

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
