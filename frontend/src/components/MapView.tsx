import { useCallback, useEffect, useRef, useState, type MouseEvent as MouseEvento } from 'react'
import { ChevronDown, ArrowLeft, X } from 'lucide-react'
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Button } from '@/components/ui/button'
import {
  FerramentasToolbar,
  type FormaDesenho,
  type ModoFerramenta,
} from '@/components/FerramentasToolbar'
import { FiltroAnimaisPanel, type FiltroEspecie } from '@/components/FiltroAnimaisPanel'
import { PainelAreas, type AreaDesenhada } from '@/components/PainelAreas'
import { areaKm2, convexHull, distanciaKm, formatarKm, formatarKm2 } from '@/utils/geo'
import {
  buscarGeometrias,
  buscarEspecies,
  consultarArea,
  type ConsultaArea,
  type FeatureCollectionGeometrias,
  type EspecieResumo,
  type PontoDaArea,
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

function htmlDoPin(slugIcone: string) {
  return (
    '<span data-animacao="crescer" class="pin-area-crescer block origin-bottom">' +
    '<svg width="46" height="62" viewBox="0 0 34 46" class="drop-shadow-md">' +
    '<path d="M17 1C8.2 1 1 8.2 1 17c0 7.41 6.49 15.33 12.39 21.83C14.39 42.83 15.63 44 17 44s2.61-1.17 3.61-2.17C26.51 32.33 33 24.41 33 17 33 8.2 25.8 1 17 1Z" class="fill-destructive"/>' +
    '<circle cx="17" cy="17" r="10" fill="#ffffff"/>' +
    `<image data-icono-phylopic x="7" y="9.5" width="20" height="15" href="/api/especies/${slugIcone}/icone/"/>` +
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
    '<circle data-fallback-crab-olho cx="15.3" cy="16.05" r="0.75" fill="#ffffff" style="display: none"/>' +
    '<circle data-fallback-crab-olho cx="18.7" cy="16.05" r="0.75" fill="#ffffff" style="display: none"/>' +
    '</svg>' +
    '</span>'
  )
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

function mesclarConsultas(respostas: (ConsultaArea | null)[]): ConsultaArea {
  const especies = new Map<string, { slug: string; nome_popular: string; contagem: number }>()
  const pontos = new Map<string, PontoDaArea>()
  for (const resposta of respostas) {
    if (!resposta) {
      continue
    }
    for (const especie of resposta.especies) {
      const atual = especies.get(especie.slug)
      if (atual) {
        atual.contagem += especie.contagem
      } else {
        especies.set(especie.slug, { ...especie })
      }
    }
    for (const ponto of resposta.pontos.features) {
      const [lon, lat] = ponto.geometry.coordinates
      const chave = `${ponto.properties.id}:${lon},${lat}`
      if (!pontos.has(chave)) {
        pontos.set(chave, ponto)
      }
    }
  }
  return {
    especies: [...especies.values()],
    pontos: { type: 'FeatureCollection', features: [...pontos.values()] },
  }
}

interface MapViewProps {
  camadasAtivas?: Record<TipoGeometria, boolean>
  onAbrirEspecie?: (slug: string) => void
  modalAberto?: boolean
  abrirListagemEm?: number
  onPesquisar?: () => void
}

export function MapView({
  camadasAtivas = { ponto: true, linha: true, poligono: true },
  onAbrirEspecie,
  modalAberto = false,
  abrirListagemEm = 0,
  onPesquisar,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const pinRef = useRef<Marker | null>(null)
  const pinAreaRef = useRef<Marker | null>(null)
  const coordenadaRef = useRef<[number, number] | null>(null)
  const bolhaRef = useRef(false)
  const fonteProntaRef = useRef(false)
  const modoRef = useRef<ModoFerramenta>('arrastar')
  const pontosDesenhoRef = useRef<number[][]>([])
  const inicioDesenhoRef = useRef<{ tela: { x: number; y: number } } | null>(null)
  const ultimaTelaRef = useRef<{ x: number; y: number } | null>(null)
  const desenhandoRef = useRef(false)
  const proximoIdRef = useRef(1)
  const areaDestaqueRef = useRef<AreaDesenhada | null>(null)
  const resultadoRef = useRef<ConsultaArea | null>(null)
  const [carregado, setCarregado] = useState(false)
  const [fontePronta, setFontePronta] = useState(false)
  const [geometrias, setGeometrias] = useState<FeatureCollectionGeometrias | null>(null)
  const [bolhaAberta, setBolhaAberta] = useState(false)
  const [listagemAberta, setListagemAberta] = useState(false)
  const [especies, setEspecies] = useState<EspecieResumo[] | null>(null)
  const [posBolha, setPosBolha] = useState<{ x: number; y: number } | null>(null)
  const [erro, setErro] = useState(false)
  const [modo, setModo] = useState<ModoFerramenta>('arrastar')
  const [colapsada, setColapsada] = useState(false)
  const [areas, setAreas] = useState<AreaDesenhada[]>([])
  const [areaAtivaId, setAreaAtivaId] = useState<string | null>(null)
  const [pontosPreview, setPontosPreview] = useState<{ x: number; y: number }[]>([])
  const [formaDesenho, setFormaDesenho] = useState<FormaDesenho>('livre')
  const [posArea, setPosArea] = useState<{ x: number; y: number } | null>(null)
  const [medicao, setMedicao] = useState<{ a: PontoDaArea; b: PontoDaArea | null } | null>(null)
  const [resultado, setResultado] = useState<ConsultaArea | null>(null)
  const [filtro, setFiltro] = useState<FiltroEspecie>('todas')
  const [animalDigitado, setAnimalDigitado] = useState('')
  const [animalAplicado, setAnimalAplicado] = useState('')
  const [especieSelecionada, setEspecieSelecionada] = useState<string | null>(null)
  const [pontoAtivo, setPontoAtivo] = useState<PontoDaArea | null>(null)
  const [listagemAreaAberta, setListagemAreaAberta] = useState(false)
  const [posBolhaArea, setPosBolhaArea] = useState<{ x: number; y: number } | null>(null)
  const [posicoesPontos, setPosicoesPontos] = useState<Record<string, { x: number; y: number }>>({})
  const cartoKey = import.meta.env.VITE_CARTO_API_KEY as string | undefined
  const [estiloAtual, setEstiloAtual] = useState(() => construirEstilo(cartoKey))
  const [reiniciar, setReiniciar] = useState(0)
  const podeTentarSemKey = useRef(Boolean(cartoKey))
  const areaEmDestaque =
    areas.find((area) => area.id === areaAtivaId) ?? areas[areas.length - 1] ?? null
  const pontosVisiveis = areas.length ? (resultado?.pontos.features ?? []) : []

  useEffect(() => {
    resultadoRef.current = resultado
  }, [resultado])

  useEffect(() => {
    areaDestaqueRef.current = areaEmDestaque
  }, [areaEmDestaque])

  const atualizarPosicoes = useCallback((mapa: MapLibreMap) => {
    const pontos = resultadoRef.current?.pontos.features ?? []
    const novas: Record<string, { x: number; y: number }> = {}
    for (const ponto of pontos) {
      const projetado = mapa.project(ponto.geometry.coordinates)
      novas[String(ponto.properties.id)] = { x: projetado.x, y: projetado.y }
    }
    setPosicoesPontos(novas)
  }, [])

  const atualizarPosicaoArea = useCallback((mapa: MapLibreMap) => {
    const area = areaDestaqueRef.current
    if (!area) {
      setPosArea(null)
      return
    }
    const anel = area.polygon.coordinates[0] ?? []
    if (!anel.length) {
      return
    }
    const centro: [number, number] = [
      anel.reduce((soma, ponto) => soma + ponto[0], 0) / anel.length,
      anel.reduce((soma, ponto) => soma + ponto[1], 0) / anel.length,
    ]
    const projetado = mapa.project?.(centro) as { x: number; y: number } | undefined
    if (!projetado) {
      return
    }
    setPosArea({ x: projetado.x, y: projetado.y })
  }, [])

  const telaDoEvento = (evento: MouseEvento<HTMLDivElement>): { x: number; y: number } => {
    const rect = containerRef.current?.getBoundingClientRect()
    return {
      x: evento.clientX - (rect?.left ?? 0),
      y: evento.clientY - (rect?.top ?? 0),
    }
  }

  const coordenadaDaTela = (tela: { x: number; y: number }): [number, number] => {
    const mapa = mapRef.current
    if (!mapa) {
      return [tela.x, tela.y]
    }
    const bruto = mapa.unproject([tela.x, tela.y]) as unknown
    if (Array.isArray(bruto)) {
      return [Number(bruto[0]), Number(bruto[1])]
    }
    const lngLat = bruto as { lng?: number; lat?: number } | undefined
    return [Number(lngLat?.lng), Number(lngLat?.lat)]
  }

  const registrarArea = (anel: number[][]) => {
    if (anel.length < 4) {
      return
    }
    const id = String(proximoIdRef.current)
    proximoIdRef.current += 1
    const nova: AreaDesenhada = {
      id,
      nome: `Área ${id}`,
      polygon: { type: 'Polygon', coordinates: [anel] },
      areaKm2: areaKm2(anel),
    }
    setAreas((atuais) => [...atuais, nova])
    setMedicao(null)
  }

  const aoMouseDown = (evento: MouseEvento<HTMLDivElement>) => {
    if (modo !== 'desenhar') {
      return
    }
    const tela = telaDoEvento(evento)
    ultimaTelaRef.current = tela
    desenhandoRef.current = true
    setPontosPreview([tela])
    if (formaDesenho === 'livre') {
      pontosDesenhoRef.current = [coordenadaDaTela(tela)]
      inicioDesenhoRef.current = null
    } else {
      pontosDesenhoRef.current = []
      inicioDesenhoRef.current = { tela }
    }
  }

  const aoMouseMove = (evento: MouseEvento<HTMLDivElement>) => {
    if (modo !== 'desenhar' || !desenhandoRef.current) {
      return
    }
    const tela = telaDoEvento(evento)
    ultimaTelaRef.current = tela
    if (formaDesenho === 'livre') {
      const pontos = pontosDesenhoRef.current
      const ponto = coordenadaDaTela(tela)
      const ultimo = pontos[pontos.length - 1]
      const mudou = !ultimo || ultimo[0] !== ponto[0] || ultimo[1] !== ponto[1]
      if (mudou) {
        pontos.push(ponto)
      }
      setPontosPreview((atuais) =>
        mudou || atuais.length === 0 ? [...atuais, tela] : [...atuais.slice(0, -1), tela],
      )
      return
    }
    const inicio = inicioDesenhoRef.current
    setPontosPreview(inicio ? [inicio.tela, tela] : [tela])
  }

  const aoMouseUp = () => {
    if (modo !== 'desenhar' || !desenhandoRef.current) {
      return
    }
    desenhandoRef.current = false
    setPontosPreview([])
    const ultimaTela = ultimaTelaRef.current
    ultimaTelaRef.current = null
    if (formaDesenho === 'livre') {
      const pontos = pontosDesenhoRef.current
      pontosDesenhoRef.current = []
      const hull = convexHull(pontos)
      if (hull.length < 3) {
        return
      }
      registrarArea([...hull, hull[0]])
      return
    }
    const inicio = inicioDesenhoRef.current
    inicioDesenhoRef.current = null
    if (!inicio || !ultimaTela) {
      return
    }
    const dx = ultimaTela.x - inicio.tela.x
    const dy = ultimaTela.y - inicio.tela.y
    if (formaDesenho === 'quadrado') {
      const lado = Math.max(Math.abs(dx), Math.abs(dy))
      if (lado < 4) {
        return
      }
      const sx = dx < 0 ? -1 : 1
      const sy = dy < 0 ? -1 : 1
      const cantos = [
        inicio.tela,
        { x: inicio.tela.x + sx * lado, y: inicio.tela.y },
        { x: inicio.tela.x + sx * lado, y: inicio.tela.y + sy * lado },
        { x: inicio.tela.x, y: inicio.tela.y + sy * lado },
      ].map((tela) => coordenadaDaTela(tela))
      registrarArea([...cantos, cantos[0]])
      return
    }
    const raio = Math.hypot(dx, dy)
    if (raio < 3) {
      return
    }
    const vertices = Array.from({ length: 32 }, (_, indice) => {
      const angulo = (indice / 32) * Math.PI * 2
      return coordenadaDaTela({
        x: inicio.tela.x + raio * Math.cos(angulo),
        y: inicio.tela.y + raio * Math.sin(angulo),
      })
    })
    registrarArea([...vertices, vertices[0]])
  }

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
      minZoom: 3,
      maxZoom: 17,
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
      if (resultadoRef.current) {
        atualizarPosicoes(map)
      }
      atualizarPosicaoArea(map)
    })
    if (modoRef.current === 'desenhar') {
      map.dragPan?.disable?.()
    } else {
      map.dragPan?.enable?.()
    }
    return () => {
      pinRef.current?.remove()
      pinRef.current = null
      pinAreaRef.current?.remove()
      pinAreaRef.current = null
      fonteProntaRef.current = false
      map.remove()
      mapRef.current = null
      setCarregado(false)
      setFontePronta(false)
      setBolhaAberta(false)
      setListagemAberta(false)
      setPosBolha(null)
    }
  }, [reiniciar, estiloAtual, atualizarPosicoes, atualizarPosicaoArea])

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
      el.innerHTML = htmlDoPin('caranguejo-uca')
      const iconoPhylopic = el.querySelector('image[data-icono-phylopic]')
      if (iconoPhylopic) {
        conectarFallbackDoIcone(el, iconoPhylopic)
      }
      el.addEventListener('mousedown', (evento) => evento.stopPropagation())
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

  useEffect(() => {
    modoRef.current = modo
    const map = mapRef.current
    if (!map) {
      return
    }
    if (modo === 'desenhar') {
      map.dragPan?.disable?.()
    } else {
      map.dragPan?.enable?.()
    }
  }, [modo, carregado])

  useEffect(() => {
    if (modo !== 'medir') {
      return
    }
    const aoTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        setMedicao(null)
      }
    }
    document.addEventListener('keydown', aoTeclear)
    return () => document.removeEventListener('keydown', aoTeclear)
  }, [modo])

  useEffect(() => {
    const map = mapRef.current
    if (map) {
      atualizarPosicaoArea(map)
    }
  }, [areaEmDestaque, carregado, atualizarPosicaoArea])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !carregado) {
      return
    }
    const dados = {
      type: 'FeatureCollection',
      features: areas.map((area) => ({
        type: 'Feature',
        properties: {
          id: area.id,
          nome: area.nome,
          ativa: area.id === areaAtivaId,
        },
        geometry: area.polygon,
      })),
    }
    const fonte = map.getSource?.('area-desenhada') as
      | { setData?: (dados: unknown) => void }
      | undefined
    if (fonte?.setData) {
      fonte.setData(dados)
      return
    }
    if (!areas.length) {
      return
    }
    map.addSource('area-desenhada', { type: 'geojson', data: dados })
    map.addLayer({
      id: 'camada-area',
      type: 'fill',
      source: 'area-desenhada',
      paint: {
        'fill-color': '#0ea5a4',
        'fill-opacity': ['case', ['get', 'ativa'], 0.45, 0.15],
        'fill-outline-color': '#0f766e',
      },
    } as never)
  }, [areas, areaAtivaId, carregado])

  useEffect(() => {
    const temporizador = setTimeout(() => setAnimalAplicado(animalDigitado), 200)
    return () => clearTimeout(temporizador)
  }, [animalDigitado])

  useEffect(() => {
    let vivo = true
    const animal = filtro === 'especifica' ? animalAplicado.trim() || null : null
    const ordenar = filtro === 'mais' ? 'mais' : filtro === 'menos' ? 'menos' : null
    const alvos = areaAtivaId ? areas.filter((area) => area.id === areaAtivaId) : areas
    if (!alvos.length) {
      consultarArea({ poligono: null, animal, ordenar }).then((dados) => {
        if (vivo) {
          setResultado(dados)
        }
      })
      return () => {
        vivo = false
      }
    }
    Promise.all(
      alvos.map((area) => consultarArea({ poligono: area.polygon, animal, ordenar })),
    ).then((respostas) => {
      if (vivo) {
        setResultado(mesclarConsultas(respostas))
      }
    })
    return () => {
      vivo = false
    }
  }, [areas, areaAtivaId, filtro, animalAplicado])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }
    atualizarPosicoes(map)
  }, [resultado, carregado, atualizarPosicoes])

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

  const escolherModo = (novo: ModoFerramenta) => {
    setModo(novo)
    setMedicao(null)
    setPontosPreview([])
  }

  const comMapa = (acao: (map: MapLibreMap) => void) => () => {
    if (mapRef.current) {
      acao(mapRef.current)
    }
  }

  const fecharBolhaArea = () => {
    pinAreaRef.current?.remove()
    pinAreaRef.current = null
    setPontoAtivo(null)
    setListagemAreaAberta(false)
    setPosBolhaArea(null)
  }

  const abrirListaArea = async () => {
    if (!pontoAtivo?.properties.especie_slugs.length) {
      const dados = await buscarEspecies()
      setEspecies(dados)
    }
    setListagemAreaAberta(true)
  }

  const marcarMedicao = (ponto: PontoDaArea) => {
    if (pontosVisiveis.length < 2) {
      return
    }
    setMedicao((atual) => {
      if (!atual || atual.b) {
        return { a: ponto, b: null }
      }
      return { a: atual.a, b: ponto }
    })
  }

  const aoClicarPonto = (ponto: PontoDaArea) => {
    if (modo === 'medir') {
      marcarMedicao(ponto)
      return
    }
    abrirPonto(ponto)
  }

  const selecionarArea = (id: string) => {
    setAreaAtivaId((atual) => (atual === id ? null : id))
  }

  const apagarArea = (id: string) => {
    setAreas((atuais) => atuais.filter((area) => area.id !== id))
    setAreaAtivaId((atual) => (atual === id ? null : atual))
  }

  const abrirPonto = (ponto: PontoDaArea) => {
    const map = mapRef.current
    if (!map) {
      return
    }
    pinAreaRef.current?.remove()
    const el = document.createElement('button')
    el.type = 'button'
    el.setAttribute('data-testid', 'pin-area')
    el.setAttribute('aria-label', ponto.properties.nome)
    el.className = 'relative cursor-pointer select-none'
    el.innerHTML = htmlDoPin(ponto.properties.especie_slugs[0] ?? 'caranguejo-uca')
    const iconoPhylopic = el.querySelector('image[data-icono-phylopic]')
    if (iconoPhylopic) {
      conectarFallbackDoIcone(el, iconoPhylopic)
    }
    el.addEventListener('mousedown', (evento) => evento.stopPropagation())
    pinAreaRef.current = new Marker({ element: el, anchor: 'bottom' })
      .setLngLat(ponto.geometry.coordinates)
      .addTo(map)
    const projetado = map.project(ponto.geometry.coordinates)
    setPosBolhaArea({ x: projetado.x, y: projetado.y })
    setPontoAtivo(ponto)
    setListagemAreaAberta(false)
  }

  const pontoParanaiba = geometrias?.features.find(
    (feature) => feature.properties.nome === 'Parnaíba',
  )
  const contagemParnaiba = pontoParanaiba?.properties.descricao ?? ''

  const nomesDasEspecies = new Map(
    (resultado?.especies ?? []).map((item) => [item.slug, item.nome_popular]),
  )

  const posicaoMedicaoA = medicao ? posicoesPontos[String(medicao.a.properties.id)] : undefined
  const posicaoMedicaoB = medicao?.b
    ? posicoesPontos[String(medicao.b.properties.id)]
    : undefined
  const linhaMedicao =
    medicao?.b && posicaoMedicaoA && posicaoMedicaoB
      ? { a: posicaoMedicaoA, b: posicaoMedicaoB }
      : null

  const hullPreview =
    formaDesenho === 'livre'
      ? convexHull(pontosPreview.map((ponto) => [ponto.x, ponto.y])).map(([x, y]) => ({ x, y }))
      : []
  const inicioPreview = pontosPreview[0]
  const atualPreview = pontosPreview[1]
  const ladoPreview =
    formaDesenho === 'quadrado' && inicioPreview && atualPreview
      ? Math.max(
          Math.abs(atualPreview.x - inicioPreview.x),
          Math.abs(atualPreview.y - inicioPreview.y),
        )
      : 0
  const raioPreview =
    formaDesenho === 'circulo' && inicioPreview && atualPreview
      ? Math.hypot(atualPreview.x - inicioPreview.x, atualPreview.y - inicioPreview.y)
      : 0
  const quadradoPreview =
    ladoPreview > 0 && inicioPreview && atualPreview
      ? {
          x: inicioPreview.x + (atualPreview.x < inicioPreview.x ? -ladoPreview : 0),
          y: inicioPreview.y + (atualPreview.y < inicioPreview.y ? -ladoPreview : 0),
        }
      : null

  return (
    <div data-testid="mapa" className="absolute inset-0">
      <div
        ref={containerRef}
        data-testid="mapa-container"
        data-zoom-min="3"
        data-zoom-max="17"
        data-poligono-desenhado={
          areas.length ? JSON.stringify(areas[areas.length - 1].polygon) : undefined
        }
        className={`h-full w-full${modo === 'desenhar' ? ' cursor-crosshair' : ''}`}
        onMouseDown={aoMouseDown}
        onMouseMove={aoMouseMove}
        onMouseUp={aoMouseUp}
      />
      {modo === 'desenhar' && (
        <svg
          data-testid="preview-desenho"
          data-forma={formaDesenho}
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          aria-hidden="true"
        >
          {formaDesenho === 'livre' && (
            <polyline
              points={(hullPreview.length >= 3 ? hullPreview : pontosPreview)
                .map((ponto) => `${ponto.x},${ponto.y}`)
                .join(' ')}
              fill="none"
              stroke="#0f766e"
              strokeWidth={2}
              strokeDasharray="6 4"
              strokeLinecap="round"
            />
          )}
          {formaDesenho === 'quadrado' && quadradoPreview && (
            <rect
              data-testid="preview-quadrado"
              x={quadradoPreview.x}
              y={quadradoPreview.y}
              width={ladoPreview}
              height={ladoPreview}
              fill="none"
              stroke="#0f766e"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}
          {formaDesenho === 'circulo' && raioPreview > 0 && inicioPreview && (
            <ellipse
              data-testid="preview-circulo"
              cx={inicioPreview.x}
              cy={inicioPreview.y}
              rx={raioPreview}
              ry={raioPreview}
              fill="none"
              stroke="#0f766e"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}
        </svg>
      )}
      {linhaMedicao && (
        <svg
          data-testid="overlay-medicao"
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          aria-hidden="true"
        >
          <line
            data-testid="linha-medida"
            x1={linhaMedicao.a.x}
            y1={linhaMedicao.a.y}
            x2={linhaMedicao.b.x}
            y2={linhaMedicao.b.y}
            stroke="#d97706"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinecap="round"
          />
        </svg>
      )}
      <FerramentasToolbar
        modo={modo}
        aoEscolherModo={escolherModo}
        formaDesenho={formaDesenho}
        aoEscolherForma={setFormaDesenho}
        colapsada={colapsada}
        aoAlternarColapso={() => setColapsada((atual) => !atual)}
        aoPesquisar={onPesquisar}
      />
      <PainelAreas
        areas={areas}
        areaAtivaId={areaAtivaId}
        aoSelecionar={selecionarArea}
        aoApagar={apagarArea}
      />
      <FiltroAnimaisPanel
        especies={resultado?.especies ?? []}
        filtro={filtro}
        aoEscolherFiltro={setFiltro}
        animal={animalDigitado}
        aoBuscarAnimal={setAnimalDigitado}
        especieSelecionada={especieSelecionada}
        aoSelecionarEspecie={setEspecieSelecionada}
        escopo={areas.length ? 'area' : 'brasil'}
      />
      {areaEmDestaque && posArea && (
        <div
          data-testid="area-tamanho"
          className="absolute z-20 -translate-x-1/2 -translate-y-full rounded-full border bg-background px-2 py-0.5 text-xs font-medium shadow"
          style={{ left: posArea.x, top: posArea.y - 8 }}
        >
          ≈ {formatarKm2(areaEmDestaque.areaKm2)} km²
        </div>
      )}
      {linhaMedicao && medicao?.b && (
        <div
          data-testid="distancia-medida"
          className="absolute z-20 -translate-x-1/2 rounded-full border bg-background px-2 py-0.5 text-xs font-medium shadow"
          style={{
            left: (linhaMedicao.a.x + linhaMedicao.b.x) / 2,
            top: (linhaMedicao.a.y + linhaMedicao.b.y) / 2 - 14,
          }}
        >
          {formatarKm(
            distanciaKm(medicao.a.geometry.coordinates, medicao.b.geometry.coordinates),
          )}{' '}
          km
        </div>
      )}
      {pontosVisiveis.map((ponto) => {
        const posicao = posicoesPontos[String(ponto.properties.id)]
        if (!posicao) {
          return null
        }
        const marcada = medicao?.a.properties.id === ponto.properties.id
        const destacado = especieSelecionada
          ? ponto.properties.especie_slugs.includes(especieSelecionada)
          : null
        const classeDestaque =
          destacado === null
            ? 'z-10 size-4 bg-teal-600'
            : destacado
              ? 'z-20 size-6 bg-amber-500 ring-4 ring-amber-400'
              : 'z-10 size-3 opacity-40'
        return (
          <button
            key={`${ponto.properties.id}-${ponto.geometry.coordinates[0]}-${ponto.geometry.coordinates[1]}`}
            type="button"
            data-testid="ponto-area"
            data-medida={marcada ? 'a' : undefined}
            data-destacado={destacado === null ? undefined : String(destacado)}
            aria-label={ponto.properties.nome}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${classeDestaque} ${
              marcada ? 'ring-4 ring-amber-400' : ''
            }`}
            style={{ left: posicao.x, top: posicao.y }}
            onClick={() => aoClicarPonto(ponto)}
          />
        )
      })}
      {pontoAtivo && !modalAberto && posBolhaArea && (
        <div
          data-testid="bolha-area"
          className="absolute z-30 w-72 -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
          style={{ left: posBolhaArea.x, top: posBolhaArea.y - 76 }}
        >
          <button
            type="button"
            data-testid="fechar-bolha-area"
            aria-label="Fechar bolha"
            className="absolute right-1.5 top-1.5 z-10 rounded-md bg-background/80 p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={fecharBolhaArea}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
          {listagemAreaAberta ? (
            <div data-testid="lista-especies-area">
              <div className="flex items-center gap-1 bg-primary px-3 py-2 text-primary-foreground">
                <button
                  type="button"
                  data-testid="bolha-area-voltar"
                  aria-label="Voltar para a contagem"
                  className="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-primary-foreground/15 focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:outline-none"
                  onClick={() => setListagemAreaAberta(false)}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                </button>
                <h3 className="flex-1 truncate text-xs font-bold uppercase tracking-wide">
                  {pontoAtivo.properties.nome}
                </h3>
              </div>
              <ul className="flex max-h-56 flex-col overflow-y-auto p-2 no-scrollbar">
                {pontoAtivo.properties.especie_slugs.length === 0
                  ? (especies ?? []).map((item) => (
                      <li key={item.slug}>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`especie-opcao-${item.slug}`}
                          className="w-full justify-start rounded-lg hover:bg-accent"
                          onClick={() => {
                            fecharBolhaArea()
                            onAbrirEspecie?.(item.slug)
                          }}
                        >
                          {item.nome_popular}
                        </Button>
                      </li>
                    ))
                  : pontoAtivo.properties.especie_slugs.map((slug) => (
                      <li key={slug}>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`area-especie-${slug}`}
                          className="w-full justify-start rounded-lg hover:bg-accent"
                          onClick={() => {
                            fecharBolhaArea()
                            onAbrirEspecie?.(slug)
                          }}
                        >
                          {nomesDasEspecies.get(slug) ?? slug}
                        </Button>
                      </li>
                    ))}
              </ul>
            </div>
          ) : (
            <div className="p-3">
              <p className="text-sm font-medium leading-snug text-foreground">
                {pontoAtivo.properties.especie_slugs.length === 0
                  ? pontoAtivo.properties.descricao
                  : `${pontoAtivo.properties.total} espécies encontradas`}
              </p>
              <Button
                variant="default"
                size="sm"
                data-testid="ver-especies-area"
                className="mt-2 w-full justify-between"
                onClick={abrirListaArea}
              >
                Ver espécies
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}
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
          style={{ left: posBolha.x, top: posBolha.y - 76 }}
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
