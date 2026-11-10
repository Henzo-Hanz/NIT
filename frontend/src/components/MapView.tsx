import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as MouseEvento,
} from 'react'
import { X } from 'lucide-react'
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Button } from '@/components/ui/button'
import {
  FerramentasToolbar,
  type FormaDesenho,
  type ModoFerramenta,
} from '@/components/FerramentasToolbar'
import { FiltroAnimaisPanel, type FiltroEspecie } from '@/components/FiltroAnimaisPanel'
import { PainelAreas, type AreaDesenhada, type ModeloElipse } from '@/components/PainelAreas'
import { areaKm2, anelDaElipse, convexHull, distanciaKm, formatarKm, formatarKm2 } from '@/utils/geo'
import { CENTRO_LITORAL_PI, ZOOM_INICIAL } from '@/lib/constantes-mapa'
import {
  buscarGeometrias,
  buscarEspecies,
  consultarArea,
  consultarBusca,
  type ConsultaArea,
  type FeatureCollectionGeometrias,
  type EspecieResumo,
  type PontoDaArea,
  type PontoDaBusca,
  type ResultadoBusca,
  type TipoGeometria,
} from '@/lib/api'

type PontoExibido = PontoDaArea | PontoDaBusca

const CHAVE_DO_PONTO = (ponto: PontoExibido) =>
  `${ponto.properties.id}:${ponto.geometry.coordinates[0]},${ponto.geometry.coordinates[1]}`

// Medição entre pontos: A nasce no 1º clique em um ponto, B no 2º; um terceiro
// clique reinicia. Cliques livres no mapa NÃO marcam mais (lapidação 4).
type MarcaMedicao = { ponto: PontoDaArea }

// Edição de área: mover o anel inteiro (drag no interior) ou reposicionar um
// vértice pela alça correspondente. Elipse com modelo usa `extra` como
// semântica da alça: cada face move SÓ o seu lado, com a face oposta fixa.
type EdicaoArea = {
  tipo: 'mover' | 'alca'
  id: string
  indice: number
  extra: 'e' | 'w' | 'n' | 's' | null
} | null

// Ordem das alças do modelo de elipse: uma por face do bbox (E, W, N, S).
const EXTRAS_DA_ELIPSE: ['e', 'w', 'n', 's'] = ['e', 'w', 'n', 's']

// FeatureCollection da fonte 'area-desenhada': todas as áreas com as
// propriedades id/nome/ativa preservadas. Serviço à gravação definitiva
//(mouseup) e ao desenho AO VIVO durante a edição (mover ou alça). Durante o
// gesto a área editada leva `emEdicao: true` — o canvas a OCULTA (fill e
// contorno com opacidade 0) e o quadro do gesto vive no DOM (SVG ghost).
function dadosDasAreas(areas: AreaDesenhada[], ativaId: string | null, emEdicaoId?: string | null) {
  return {
    type: 'FeatureCollection',
    features: areas.map((area) => ({
      type: 'Feature',
      properties: {
        id: area.id,
        nome: area.nome,
        ativa: area.id === ativaId,
        emEdicao: area.id === emEdicaoId,
      },
      geometry: area.polygon,
    })),
  }
}

const TILES_VOYAGER = [
  'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
]

function conectarCadeiaDeIcones(pin: HTMLElement) {
  // O pin tenta os ícones das espécies do ponto em ordem (o primeiro que
  // carregar vence); se nenhum carregar, mostra o caranguejo APENAS quando o
  // ponto contém 'caranguejo-uca', pois os grupos só existem nesse pin.
  const imagens = Array.from(pin.querySelectorAll('image[data-icono-phylopic]'))
  imagens.forEach((imagem, indice) => {
    imagem.addEventListener('error', () => {
      ;(imagem as SVGImageElement).style.display = 'none'
      const proximo = imagens[indice + 1]
      if (proximo) {
        ;(proximo as SVGImageElement).style.display = ''
        return
      }
      pin
        .querySelectorAll('[data-fallback-crab], [data-fallback-crab-patas], [data-fallback-crab-olho]')
        .forEach((parte) => {
          ;(parte as HTMLElement).removeAttribute('style')
        })
    })
  })
}

function construirImagensDoPin(slugs: string[]) {
  return slugs
    .map(
      (slug, indice) =>
        `<image data-icono-phylopic data-indice="${indice}" x="7" y="9.5" width="20" height="15" preserveAspectRatio="xMidYMid meet" href="/api/especies/${slug}/icone/"${
          indice ? ' style="display: none"' : ''
        }/>`,
    )
    .join('')
}

// Pin liso: círculo vazio, sem silhueta — usado quando o ponto não tem
// espécie com ícone e não contém caranguejo-uca.
function htmlDoPinLiso() {
  return (
    '<span data-animacao="crescer" class="pin-area-crescer block origin-bottom">' +
    '<svg width="46" height="62" viewBox="0 0 34 46" class="drop-shadow-md">' +
    '<path d="M17 1C8.2 1 1 8.2 1 17c0 7.41 6.49 15.33 12.39 21.83C14.39 42.83 15.63 44 17 44s2.61-1.17 3.61-2.17C26.51 32.33 33 24.41 33 17 33 8.2 25.8 1 17 1Z" class="fill-destructive"/>' +
    '<circle cx="17" cy="17" r="10" fill="#ffffff"/>' +
    '</svg>' +
    '</span>'
  )
}

function corpoDoPin(imagens: string, comFallback: boolean) {
  const fallbackCrab = comFallback
    ? '<g data-fallback-crab class="fill-destructive" style="display: none">' +
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
      '<circle data-fallback-crab-olho cx="18.7" cy="16.05" r="0.75" fill="#ffffff" style="display: none"/>'
    : ''
  return (
    '<span data-animacao="crescer" class="pin-area-crescer block origin-bottom">' +
    '<svg width="46" height="62" viewBox="0 0 34 46" class="drop-shadow-md">' +
    '<path d="M17 1C8.2 1 1 8.2 1 17c0 7.41 6.49 15.33 12.39 21.83C14.39 42.83 15.63 44 17 44s2.61-1.17 3.61-2.17C26.51 32.33 33 24.41 33 17 33 8.2 25.8 1 17 1Z" class="fill-destructive"/>' +
    '<circle cx="17" cy="17" r="10" fill="#ffffff"/>' +
    imagens +
    fallbackCrab +
    '</svg>' +
    '</span>'
  )
}

function htmlDoPin(slugs: string[]) {
  if (!slugs.length) {
    return htmlDoPinLiso()
  }
  return corpoDoPin(construirImagensDoPin(slugs), slugs.includes('caranguejo-uca'))
}

// Saída do pin: classe `pin-sumir` (fade-out espelhando o `pin-crescer` de
// entrada) e remoção REAL só no `animationend` do próprio elemento — com
// guarda de 250ms caso o evento não dispare (evita pin fantasma). Cada
// elemento cuida do próprio ciclo: nenhum estado compartilhado entre pins
// (um novo pode nascer enquanto o velho ainda está saindo).
function sumirPin(el: HTMLElement, remover: () => void) {
  el.classList.add('pin-sumir')
  let saiu = false
  const encerrar = () => {
    if (saiu) {
      return
    }
    saiu = true
    el.removeEventListener('animationend', aoTerminar)
    remover()
  }
  const aoTerminar = (evento: Event) => {
    // Só conta o fim da animação PRÓPRIA (o fim da de entrada borbulha do
    // conteúdo, com alvo no filho).
    if (evento.target === el) {
      encerrar()
    }
  }
  el.addEventListener('animationend', aoTerminar)
  setTimeout(encerrar, 250)
}

// Despedida do Marker do pin: anima a saída do elemento e solta o Marker só
// no fim (o próprio conteúdo se resolve, sem re-render no React). No runtime
// real (maplibre-gl 6), o elemento é acessado por getElement() e a prop
// interna é `_element` — `.element` fica como último recurso para os fakes.
function despedirPin(pin: Marker) {
  const candidato = pin as unknown as {
    getElement?: () => HTMLElement
    _element?: HTMLElement
    element?: HTMLElement
  }
  const elemento = candidato.getElement?.() ?? candidato._element ?? candidato.element
  if (!elemento) {
    pin.remove()
    return
  }
  sumirPin(elemento, () => {
    pin.remove()
    if (elemento?.isConnected) {
      elemento.remove()
    }
  })
}

// Prefetch de ícones (lapidação 11): os SVGs dos pontos visíveis são baixados
// por baixo do pano — o 1º clique no pin não fica esperando a cadeia de
// fallback. Roda FORA da crítica: requestIdleCallback quando existe, com
// fallback de setTimeout(50ms); no máximo 2 por rodada.
function prefetchIcone(slug: string) {
  new Image().src = `/api/especies/${slug}/icone/`
}

function agendarOcioso(acao: () => void) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => acao())
  } else {
    setTimeout(acao, 50)
  }
}

type FilaPrefetch = { pendentes: string[]; ocioso: boolean }

function rodadaPrefetch(baixados: Set<string>, fila: FilaPrefetch) {
  fila.ocioso = false
  let baixadosNesta = 0
  while (baixadosNesta < 2 && fila.pendentes.length > 0) {
    const slug = fila.pendentes.shift() as string
    if (baixados.has(slug)) {
      continue
    }
    baixados.add(slug)
    prefetchIcone(slug)
    baixadosNesta += 1
  }
  if (fila.pendentes.length > 0) {
    fila.ocioso = true
    agendarOcioso(() => rodadaPrefetch(baixados, fila))
  }
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

// PNPOLY: ponto interior ao anel de um polígono desenhado (anel fechado).
function pontoNoPoligono(coordenada: [number, number], anel: number[][]): boolean {
  const [x, y] = coordenada
  let dentro = false
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i, i += 1) {
    const [xi, yi] = anel[i]
    const [xj, yj] = anel[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      dentro = !dentro
    }
  }
  return dentro
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
  const pinAreaRef = useRef<Marker | null>(null)
  const fonteProntaRef = useRef(false)
  const modoRef = useRef<ModoFerramenta>('arrastar')
  const pontosDesenhoRef = useRef<number[][]>([])
  const inicioDesenhoRef = useRef<{ tela: { x: number; y: number } } | null>(null)
  const ultimaTelaRef = useRef<{ x: number; y: number } | null>(null)
  const desenhandoRef = useRef(false)
  const proximoIdRef = useRef(1)
  const areaDestaqueRef = useRef<AreaDesenhada | null>(null)
  const resultadoRef = useRef<ConsultaArea | null>(null)
  // Resultado POR ÁREA (cache): a consulta de um gesto re-busca só a área
  // editada e mescla com as respostas já obtidas das demais.
  const resultadosPorAreaRef = useRef<Map<string, { assinatura: string; resultado: ConsultaArea }>>(
    new Map(),
  )
  const consultaGeracaoRef = useRef(0)
  const pontosExibeRef = useRef<PontoExibido[]>([])
  const pedidoBuscaRef = useRef(0)
  const piscaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dicaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const edicaoRef = useRef<EdicaoArea>(null)
  const inicioEdicaoRef = useRef<{ tela: { x: number; y: number } } | null>(null)
  const anelOriginalRef = useRef<number[][]>([])
  const poligonoEdicaoRef = useRef<number[][]>([])
  const alcasSvgRef = useRef<SVGSVGElement | null>(null)
  // Quadro do gesto: polígono SVG do DOM, atualizado por setAttribute no
  // mesmo tick do setData (sem estado React por frame).
  const poligonoGestoRef = useRef<SVGPolygonElement | null>(null)
  // Modelo de elipse da área em edição: snapshot inicial (para fator/clamp)
  // e vivo (atualizado pelo gesto); o espelho em state alimenta o render.
  const modeloInicialRef = useRef<ModeloElipse | null>(null)
  const modeloEdicaoRef = useRef<ModeloElipse | null>(null)
  const areasRef = useRef<AreaDesenhada[]>([])
  const pontoAtivoRef = useRef<PontoDaArea | null>(null)
  const bolhaAreaRef = useRef(false)
  const especiesRef = useRef<EspecieResumo[] | null>(null)
  const ultimaPiscaRef = useRef(0)
  const removerPinAreaRef = useRef<() => void>(() => undefined)
  const ultimoPontoBolhaRef = useRef<PontoDaArea | null>(null)
  const [carregado, setCarregado] = useState(false)
  const [fontePronta, setFontePronta] = useState(false)
  const [geometrias, setGeometrias] = useState<FeatureCollectionGeometrias | null>(null)
  const [bolhaAreaAberta, setBolhaAreaAberta] = useState(false)
  const [especies, setEspecies] = useState<EspecieResumo[] | null>(null)
  const [posBolhaArea, setPosBolhaArea] = useState<{ x: number; y: number } | null>(null)
  const [erro, setErro] = useState(false)
  const [modo, setModo] = useState<ModoFerramenta>('arrastar')
  const [colapsada, setColapsada] = useState(false)
  const [areas, setAreas] = useState<AreaDesenhada[]>([])
  const [areaAtivaId, setAreaAtivaId] = useState<string | null>(null)
  const [pontosPreview, setPontosPreview] = useState<{ x: number; y: number }[]>([])
  const [formaDesenho, setFormaDesenho] = useState<FormaDesenho>('livre')
  const [posArea, setPosArea] = useState<{ x: number; y: number } | null>(null)
  const [medicao, setMedicao] = useState<{ a: MarcaMedicao; b: MarcaMedicao | null } | null>(null)
  const [resultado, setResultado] = useState<ConsultaArea | null>(null)
  const [filtro, setFiltro] = useState<FiltroEspecie>('todas')
  const [animalDigitado, setAnimalDigitado] = useState('')
  const [animalAplicado, setAnimalAplicado] = useState('')
  const [especieSelecionada, setEspecieSelecionada] = useState<string | null>(null)
  const [especiePeloBusca, setEspeciePeloBusca] = useState(false)
  const [buscaAberto, setBuscaAberto] = useState(false)
  const [buscaTermo, setBuscaTermo] = useState('')
  const [buscaResultado, setBuscaResultado] = useState<ResultadoBusca | null>(null)
  const [pisca, setPisca] = useState<{ filtro: string; vez: number } | null>(null)
  const [dicaMedir, setDicaMedir] = useState(false)
  const [sobreArea, setSobreArea] = useState(false)
  const [edicao, setEdicao] = useState<EdicaoArea>(null)
  const [poligonoEdicao, setPoligonoEdicao] = useState<number[][] | null>(null)
  const [modeloEdicao, setModeloEdicao] = useState<ModeloElipse | null>(null)
  const [pontoAtivo, setPontoAtivo] = useState<PontoDaArea | null>(null)
  const [posicoesPontos, setPosicoesPontos] = useState<Record<string, { x: number; y: number }>>({})
  const baixadosPrefetchRef = useRef<Set<string>>(new Set())
  const filaPrefetchRef = useRef<FilaPrefetch>({ pendentes: [], ocioso: false })
  const cartoKey = import.meta.env.VITE_CARTO_API_KEY as string | undefined
  const [estiloAtual, setEstiloAtual] = useState(() => construirEstilo(cartoKey))
  const [reiniciar, setReiniciar] = useState(0)
  const podeTentarSemKey = useRef(Boolean(cartoKey))
  const areaEmDestaque =
    areas.find((area) => area.id === areaAtivaId) ?? areas[areas.length - 1] ?? null
  // Premissa aprovada (lapidação 3): os pontos ficam SEMPRE visíveis no escopo
  // atual — com área desenhada, só os pontos dela; sem área, o Brasil inteiro.
  // Revoga o comportamento da lapidação 2 ("pontos só dentro de área").
  const pontosEscopo = resultado?.pontos.features ?? []
  const buscaAtiva = buscaAberto && buscaResultado !== null
  const chavesBusca = new Set(
    buscaAtiva ? (buscaResultado?.pontos.features ?? []).map(CHAVE_DO_PONTO) : [],
  )
  // Lapidação 11: os filtros DETERMINAM os pontos renderizados. "Mais"/"menos"
  // = os 3 primeiros de `resultado.especies` (o server envia `mais` desc. por
  // contagem e `menos` asc. — mesma lista invertida, empate por nome); com
  // menos de 3 espécies no resultado, o top é a lista inteira. Espécie clicada
  // (painel ou busca) restringe ao que a contém. Específico por texto já fica
  // no server (o resultado chega filtrado). PREMISSA: mais/menos junto de
  // espécie clicada vira união dos slugs. Área primeiro: a consulta só devolve
  // pontos internos às áreas e o filtro opera sobre esse resultado — nunca
  // ressuscita ponto fora de área; o overlay da busca segue a mesma regra.
  // Memoizado: a identidade estável permite o efeito que recria o pin quando
  // o conjunto muda (pin/bolha refletem o subconjunto novo).
  const slugsDoFiltro: string[] = useMemo(() => {
    if (filtro === 'mais' || filtro === 'menos') {
      return (resultado?.especies ?? []).slice(0, 3).map((especie) => especie.slug)
    }
    // Premissa aprovada (lapidação 11): com 'específica' + texto, o conjunto é
    // o que `resultado.especies` traz (o server já devolveu tudo filtrado);
    // sem texto NÃO há restrição — pin/bolha mostram o ponto inteiro.
    if (filtro === 'especifica' && animalAplicado.trim()) {
      return (resultado?.especies ?? []).map((especie) => especie.slug)
    }
    return []
  }, [filtro, resultado, animalAplicado])
  const conjuntoFiltro = useMemo(
    () => new Set([...slugsDoFiltro, ...(especieSelecionada ? [especieSelecionada] : [])]),
    [slugsDoFiltro, especieSelecionada],
  )
  // Espelho do conjunto para o caminho imperativo: o filtro determina TAMBÉM o
  // CONTEÚDO do pin/bolha (premissa da lapidação 11 — não exclui os outros
  // animais dos pontos, corta a exibição deles), e o clique/lá no momento do
  // click precisa do conjunto VIVO, não da closure do render.
  const conjuntoFiltroRef = useRef<Set<string>>(conjuntoFiltro)
  conjuntoFiltroRef.current = conjuntoFiltro
  // Subconjunto do ponto dentro do conjunto do filtro, na ordem original de
  // `especie_slugs`. Sem conjunto (todas / sem texto) → o ponto inteiro.
  const slugsDoFiltroNoPonto = (ponto: PontoDaArea): string[] => {
    const conjunto = conjuntoFiltroRef.current
    if (conjunto.size === 0) {
      return ponto.properties.especie_slugs
    }
    return ponto.properties.especie_slugs.filter((slug) => conjunto.has(slug))
  }
  const casaComFiltro = (ponto: PontoDaArea) =>
    conjuntoFiltro.size === 0 ||
    ponto.properties.especie_slugs.some((slug) => conjuntoFiltro.has(slug))
  // Área antes de qualquer filtro: um ponto fora de TODAS as áreas desenhadas
  // já está fora do escopo, inclusive quando veio do overlay da busca (a
  // consulta por área não o traria; a busca traria, e ele não deve aparecer).
  const dentroDeAlgumaArea = (ponto: PontoExibido) =>
    areas.length === 0 ||
    areas.some((area) =>
      pontoNoPoligono(ponto.geometry.coordinates as [number, number], area.polygon.coordinates[0] ?? []),
    )
  const pontosVisiveis: PontoExibido[] = buscaAtiva
    ? [
        ...(buscaResultado?.pontos.features ?? []).filter(
          (ponto) => dentroDeAlgumaArea(ponto) && casaComFiltro(ponto),
        ),
        ...pontosEscopo.filter(
          (ponto) => !chavesBusca.has(CHAVE_DO_PONTO(ponto)) && casaComFiltro(ponto),
        ),
      ]
    : pontosEscopo.filter(casaComFiltro)

  // Os pontos de espécie são GEO-FIXOS: NUNCA se movem nem se ocultam durante
  // o gesto de edição (imóveis e visíveis como fora dele); o conjunto só muda
  // no release, pela consulta (o server é a fonte da verdade).
  const pontosExibidos = pontosVisiveis

  useEffect(() => {
    resultadoRef.current = resultado
  }, [resultado])

  useEffect(() => {
    areaDestaqueRef.current = areaEmDestaque
  }, [areaEmDestaque])

  useEffect(() => {
    pontosExibeRef.current = pontosExibidos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pontosExibidos])

  // Prefetch dos ícones (lapidação 12): `rodadaPrefetch` existia mas NUNCA era
  // chamada — por isso o 1º clique no ponto abria o pin com o fundo branco até
  // o SVG chegar da rede. Agora todo conjunto visível enfileira os slugs que
  // ainda não foram baixados e uma rodada ociosa (2 por vez) começa sozinha.
  useEffect(() => {
    const fila = filaPrefetchRef.current
    const novos = new Set<string>()
    for (const ponto of pontosVisiveis) {
      for (const slug of ponto.properties.especie_slugs) {
        if (!baixadosPrefetchRef.current.has(slug) && !fila.pendentes.includes(slug)) {
          novos.add(slug)
        }
      }
    }
    if (!novos.size) {
      return
    }
    fila.pendentes = [...novos, ...fila.pendentes]
    if (!fila.ocioso) {
      rodadaPrefetch(baixadosPrefetchRef.current, fila)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pontosVisiveis])

  useEffect(() => {
    areasRef.current = areas
  }, [areas])

  useEffect(() => {
    pontoAtivoRef.current = pontoAtivo
  }, [pontoAtivo])

  useEffect(() => {
    bolhaAreaRef.current = bolhaAreaAberta && !modalAberto
  }, [bolhaAreaAberta, modalAberto])

  useEffect(() => {
    especiesRef.current = especies
  }, [especies])

  const atualizarPosicoes = useCallback((mapa: MapLibreMap) => {
    const pontos = pontosExibeRef.current
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

  const telaDoEvento = (evento: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = containerRef.current?.getBoundingClientRect()
    return {
      x: evento.clientX - (rect?.left ?? 0),
      y: evento.clientY - (rect?.top ?? 0),
    }
  }

  const telaDeJanela = (evento: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = containerRef.current?.getBoundingClientRect()
    return {
      x: evento.clientX - (rect?.left ?? 0),
      y: evento.clientY - (rect?.top ?? 0),
    }
  }

  const coordenadaDaTela = useCallback((tela: { x: number; y: number }): [number, number] => {
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
  }, [])

  const iniciarEdicao = useCallback(
    (
      tipo: 'mover' | 'alca',
      id: string,
      indice: number,
      tela: { x: number; y: number } | null,
      extra: 'e' | 'w' | 'n' | 's' | null = null,
    ) => {
      const area = areasRef.current.find((item) => item.id === id)
      const anel = area?.polygon.coordinates[0]
      if (!area || !anel?.length) {
        return
      }
      edicaoRef.current = { tipo, id, indice, extra }
      anelOriginalRef.current = anel.map((ponto) => [...ponto])
      poligonoEdicaoRef.current = anel.map((ponto) => [...ponto])
      modeloInicialRef.current = area.modelo
        ? { ...area.modelo, centro: [...area.modelo.centro] as [number, number] }
        : null
      modeloEdicaoRef.current = modeloInicialRef.current
      setModeloEdicao(modeloInicialRef.current)
      inicioEdicaoRef.current = tela ? { tela } : null
      setEdicao(edicaoRef.current)
      setPoligonoEdicao(poligonoEdicaoRef.current)
      mapRef.current?.dragPan?.disable?.()
    },
    [],
  )

  // Desenho AO VIVO durante a edição (mover ou alça): troca, na fonte
  // 'area-desenhada', o anel da área editada (id/nome/ativa preservados),
  // sem esperar o mouseup — o fill/contorno acompanham o gesto por frame.
  const atualizarAreaAoVivo = useCallback(
    (mapa: MapLibreMap | null, ativa: EdicaoArea, anel: number[][]): boolean => {
      if (!mapa || !ativa) {
        return false
      }
      const fonte = mapa.getSource?.('area-desenhada') as
        | { setData?: (dados: unknown) => void }
        | undefined
      const editada = areasRef.current.find((area) => area.id === ativa.id)
      if (!fonte?.setData || !editada) {
        return false
      }
      fonte.setData(
        dadosDasAreas(
          areasRef.current.map((area) =>
            area.id === ativa.id
              ? { ...area, polygon: { type: 'Polygon', coordinates: [anel] } }
              : area,
          ),
          areaAtivaId,
          ativa.id,
        ),
      )
      return true
    },
    [areaAtivaId],
  )

  // Posições (tela) das 4 alças do modelo — uma por face do bbox — MESMA
  // ordem do render e do reposicionamento imperativo.
  const pontosDaElipse = useCallback((modelo: ModeloElipse): { x: number; y: number }[] => {
    const mapa = mapRef.current
    if (!mapa) {
      return []
    }
    const [cx, cy] = modelo.centro
    const left = cx - modelo.rx
    const right = cx + modelo.rx
    const bottom = cy - modelo.ry
    const top = cy + modelo.ry
    return [
      mapa.project([right, cy]),
      mapa.project([left, cy]),
      mapa.project([cx, top]),
      mapa.project([cx, bottom]),
    ] as { x: number; y: number }[]
  }, [])

  // Reposiciona os círculos das alças IMPERATIVAMENTE no mesmo tick do setData:
  // sem isso, o commit do React (assíncrono) os deixa ~1 frame atrás do fill.
  // Ordem dos círculos = mesma do render (.slice(0, -1) do anel editado); o
  // re-render React reescreve os mesmos valores depois (harmônico).
  const reposicionarAlcas = useCallback((): void => {
    const svg = alcasSvgRef.current
    const mapa = mapRef.current
    if (!svg || !mapa) {
      return
    }
    const ativa = edicaoRef.current
    if (!ativa) {
      return
    }
    let pontos: { x: number; y: number }[] = []
    if (modeloEdicaoRef.current) {
      pontos = pontosDaElipse(modeloEdicaoRef.current)
    } else {
      const anel = poligonoEdicaoRef.current
      if (!anel.length) {
        return
      }
      pontos = anel
        .slice(0, -1)
        .map((vertice) => mapa.project(vertice as [number, number]) as { x: number; y: number })
    }
    const circulos = svg.querySelectorAll('circle')
    pontos.forEach((ponto, indice) => {
      const circulo = circulos[indice] as SVGCircleElement | undefined
      if (!circulo) {
        return
      }
      circulo.setAttribute('cx', String(ponto.x))
      circulo.setAttribute('cy', String(ponto.y))
    })
  }, [pontosDaElipse])

  // Quadro do gesto no MESMO tick do setData: o contorno + vértices do anel
  // vivo vivem num SVG do DOM (poligono-gesto) e são atualizados por
  // setAttribute a cada mousemove — a projeção é a mesma dos vértices/alças.
  // Nada de estado React por frame: o canvas só reassume no release.
  const atualizarPoligonoGesto = useCallback((anel: number[][]): boolean => {
    const poligono = poligonoGestoRef.current
    const mapa = mapRef.current
    if (!poligono || !mapa) {
      return false
    }
    poligono.setAttribute(
      'points',
      anel
        .map((vertice) => {
          const projetado = mapa.project(vertice as [number, number]) as { x: number; y: number }
          return `${projetado.x},${projetado.y}`
        })
        .join(' '),
    )
    return true
  }, [])

  // Pixels → graus por eixo: distância entre a tela (0,0) e a tela (px,0) /
  // (0,px) — piso dos raios/elipse (~3px) e clamp do retângulo (~4px/eixo).
  const grausPorPixels = useCallback(
    (pixels: number, eixo: 'x' | 'y' = 'x') => {
      const origem = coordenadaDaTela({ x: 0, y: 0 })
      const offset = coordenadaDaTela(eixo === 'x' ? { x: pixels, y: 0 } : { x: 0, y: pixels })
      return Math.abs(offset[eixo === 'x' ? 0 : 1] - origem[eixo === 'x' ? 0 : 1])
    },
    [coordenadaDaTela],
  )

  // Release SEM gravação (anel colapsado/insuficiente): a fonte fica com
  // emEdicao: true do gesto vivo — o setData final SEM emEdicao devolve o
  // canvas ao estado gravado (o quadro SVG some no render seguinte).
  const descartarEmEdicao = useCallback(() => {
    const fonte = mapRef.current?.getSource?.('area-desenhada') as
      | { setData?: (dados: unknown) => void }
      | undefined
    if (fonte?.setData) {
      fonte.setData(dadosDasAreas(areasRef.current, areaAtivaId))
    }
  }, [areaAtivaId])

  const finalizarEdicao = useCallback(() => {
    const ativa = edicaoRef.current
    if (!ativa) {
      return
    }
    edicaoRef.current = null
    inicioEdicaoRef.current = null
    const modeloFinal = modeloEdicaoRef.current
    modeloInicialRef.current = null
    modeloEdicaoRef.current = null
    setEdicao(null)
    setModeloEdicao(null)
    setPoligonoEdicao(null)
    mapRef.current?.dragPan?.enable?.()
    const novos = poligonoEdicaoRef.current
    if (novos.length < 4) {
      descartarEmEdicao()
      return
    }
    const km2 = areaKm2(novos)
    // Sem colapso: só assume a nova forma quando a área permanece positiva.
    if (km2 <= 0) {
      descartarEmEdicao()
      return
    }
    setAreas((atuais) =>
      atuais.map((area) =>
        area.id === ativa.id
          ? {
              ...area,
              polygon: { type: 'Polygon', coordinates: [novos] },
              areaKm2: km2,
              ...(modeloFinal ? { modelo: modeloFinal } : {}),
            }
          : area,
      ),
    )
  }, [descartarEmEdicao])

  const registrarArea = (anel: number[][], modelo?: ModeloElipse) => {
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
      ...(modelo ? { modelo } : {}),
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
    // Cursor de edição: garrinha quando o ponteiro paira sobre uma área no
    // modo arrastar; durante o gesto o cursor fica "grabbing".
    if (modo === 'arrastar' && !edicaoRef.current) {
      const tela = telaDoEvento(evento)
      const coordenada = coordenadaDaTela(tela)
      const dentro = areasRef.current.some((area) =>
        pontoNoPoligono(coordenada, area.polygon.coordinates[0] ?? []),
      )
      setSobreArea(dentro)
    }
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
    if (formaDesenho === 'retangulo') {
      // Retângulo de verdade (lapidação 4): largura e altura independentes,
      // ancorado no canto inicial, com mínimo de 4px por eixo.
      if (Math.abs(dx) < 4 || Math.abs(dy) < 4) {
        return
      }
      const sx = dx < 0 ? -1 : 1
      const sy = dy < 0 ? -1 : 1
      const cantos = [
        inicio.tela,
        { x: inicio.tela.x + sx * Math.abs(dx), y: inicio.tela.y },
        { x: inicio.tela.x + sx * Math.abs(dx), y: inicio.tela.y + sy * Math.abs(dy) },
        { x: inicio.tela.x, y: inicio.tela.y + sy * Math.abs(dy) },
      ].map((tela) => coordenadaDaTela(tela))
      registrarArea([...cantos, cantos[0]])
      return
    }
    const raio = Math.hypot(dx, dy)
    if (raio < 3) {
      return
    }
    // Elipse DESDE o desenho (lapidação 11): rx = |dx| e ry = |dy| de tela,
    // INDEPENDENTES desde o gesto e em qualquer direção (abs), com piso
    // ~3px por raio. Centro = origem do arrasto; raios em graus repondo um
    // offset de tela do próprio delta (PREMISSA: distorção da latitude
    // aceitável para a demo). Anel gerado pela util compartilhada.
    const centro = coordenadaDaTela(inicio.tela)
    const minimo = grausPorPixels(3)
    const rx = Math.max(
      minimo,
      Math.abs(coordenadaDaTela({ x: inicio.tela.x + dx, y: inicio.tela.y })[0] - centro[0]),
    )
    const ry = Math.max(
      minimo,
      Math.abs(coordenadaDaTela({ x: inicio.tela.x, y: inicio.tela.y + dy })[1] - centro[1]),
    )
    registrarArea(anelDaElipse(centro, rx, ry, 32), {
      tipo: 'elipse',
      centro,
      rx,
      ry,
    })
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
      atualizarPosicoes(map)
      if (bolhaAreaRef.current && pontoAtivoRef.current) {
        const projetado = map.project(pontoAtivoRef.current.geometry.coordinates)
        setPosBolhaArea({ x: projetado.x, y: projetado.y })
      }
    })
    if (modoRef.current === 'desenhar') {
      map.dragPan?.disable?.()
    } else {
      map.dragPan?.enable?.()
    }
    return () => {
      // Desmonte/estilo novo descarta o mapa inteiro de uma vez: remoção SEM
      // animação (a saída animada de `sumirPin` vale só para UM pin por vez).
      pinAreaRef.current?.remove()
      pinAreaRef.current = null
      fonteProntaRef.current = false
      map.remove()
      mapRef.current = null
      setCarregado(false)
      setFontePronta(false)
      setBolhaAreaAberta(false)
      setPosBolhaArea(null)
    }
  }, [reiniciar, estiloAtual, atualizarPosicoes])

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
    // Lapidação 4: o Parnaíba NÃO ganha mais pin automático na carga e nunca
    // houve bolha própria dele — pins só sobem no fluxo do ponto (abrirPonto,
    // 1º clique = pin, 2º = bolha).
    setFontePronta(true)
  }, [carregado, geometrias])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !fontePronta) {
      return
    }
    // Lapidação 12: respondida a consulta, os pontos do mapa são os BOTÕES
    // filtrados (pontosVisiveis). A camada base do seed só desenha enquanto
    // não há resultado — mantê-la visível pintava todos os pontos sempre e
    // anulava qualquer filtro (mais/menos presente, espécie, área).
    for (const [idCamada, tipo] of Object.entries(TIPO_POR_CAMADA)) {
      const visivel = tipo === 'ponto' ? camadasAtivas.ponto && !resultado : camadasAtivas[tipo]
      map.setLayoutProperty(idCamada, 'visibility', visivel ? 'visible' : 'none')
    }
  }, [fontePronta, camadasAtivas, resultado])

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

  // Edição de área (só no modo arrastar): intercepta o mousedown em CAPTURA,
  // antes do próprio MapLibre, para impedir o pan quando o cursor pega o
  // interior de uma área desenhada — aí começa o drag que move TODA a área
  // (todos os vértices transladam juntos pela projeção em pixels).
  useEffect(() => {
    if (modo !== 'arrastar' || !carregado) {
      return
    }
    const container = containerRef.current
    if (!container) {
      return
    }
    const aoInterceptar = (evento: MouseEvent) => {
      if (edicaoRef.current) {
        return
      }
      const alvo = evento.target as Element
      if (alvo.closest('.maplibregl-marker, button')) {
        return
      }
      if (!areasRef.current.length) {
        return
      }
      const rect = container.getBoundingClientRect()
      const tela = {
        x: evento.clientX - rect.left,
        y: evento.clientY - rect.top,
      }
      const coordenada = coordenadaDaTela(tela)
      const alvoArea = areasRef.current.find((area) =>
        pontoNoPoligono(coordenada, area.polygon.coordinates[0] ?? []),
      )
      if (!alvoArea) {
        setSobreArea(false)
        return
      }
      evento.preventDefault()
      evento.stopPropagation()
      iniciarEdicao('mover', alvoArea.id, 0, tela)
    }
    container.addEventListener('mousedown', aoInterceptar, { capture: true })
    return () => {
      container.removeEventListener('mousedown', aoInterceptar, { capture: true })
    }
  }, [modo, carregado, coordenadaDaTela, iniciarEdicao])

  // Gesto de edição em curso (mover área ou arrastar alça): acompanha o
  // movimento pela janela e, ao soltar, grava o polígono — consulta re-dispara
  // sozinha pela dependência de `areas`.
  useEffect(() => {
    if (!edicao) {
      return
    }
    const aoMover = (evento: MouseEvent) => {
      const ativa = edicaoRef.current
      if (!ativa) {
        return
      }
      const tela = telaDeJanela(evento)
      if (ativa.tipo === 'mover') {
        const inicio = inicioEdicaoRef.current
        if (!inicio) {
          return
        }
        const coordAtual = coordenadaDaTela(tela)
        const coordInicial = coordenadaDaTela(inicio.tela)
        const dLon = coordAtual[0] - coordInicial[0]
        const dLat = coordAtual[1] - coordInicial[1]
        const modelo = modeloInicialRef.current
        if (modelo) {
          // Elipse: translada o CENTRO do modelo e regenera o anel pela util.
          const novo: ModeloElipse = {
            ...modelo,
            centro: [modelo.centro[0] + dLon, modelo.centro[1] + dLat],
          }
          modeloEdicaoRef.current = novo
          setModeloEdicao(novo)
          poligonoEdicaoRef.current = anelDaElipse(novo.centro, novo.rx, novo.ry)
        } else {
          poligonoEdicaoRef.current = anelOriginalRef.current.map((vertice) => [
            vertice[0] + dLon,
            vertice[1] + dLat,
          ])
        }
      } else if (ativa.extra && modeloInicialRef.current) {
        // Alça de FACE da elipse: move só a face puxada e mantém a OPOSTA
        // fixa (nada de crescimento simétrico). Cruzar a face oposta trava no
        // piso ~3px, sem inverter/espelhar.
        const modelo = modeloInicialRef.current
        const cursor = coordenadaDaTela(tela)
        const minimo = grausPorPixels(3)
        const [cx, cy] = modelo.centro
        const left = cx - modelo.rx
        const right = cx + modelo.rx
        const bottom = cy - modelo.ry
        const top = cy + modelo.ry
        let novo: ModeloElipse
        if (ativa.extra === 'e') {
          const novoRight = Math.max(cursor[0], left + minimo)
          novo = {
            tipo: 'elipse',
            centro: [(left + novoRight) / 2, cy],
            rx: (novoRight - left) / 2,
            ry: modelo.ry,
          }
        } else if (ativa.extra === 'w') {
          const novoLeft = Math.min(cursor[0], right - minimo)
          novo = {
            tipo: 'elipse',
            centro: [(novoLeft + right) / 2, cy],
            rx: (right - novoLeft) / 2,
            ry: modelo.ry,
          }
        } else if (ativa.extra === 'n') {
          const novoTop = Math.max(cursor[1], bottom + minimo)
          novo = {
            tipo: 'elipse',
            centro: [cx, (bottom + novoTop) / 2],
            rx: modelo.rx,
            ry: (novoTop - bottom) / 2,
          }
        } else {
          const novoBottom = Math.min(cursor[1], top - minimo)
          novo = {
            tipo: 'elipse',
            centro: [cx, (top + novoBottom) / 2],
            rx: modelo.rx,
            ry: (top - novoBottom) / 2,
          }
        }
        modeloEdicaoRef.current = novo
        setModeloEdicao(novo)
        poligonoEdicaoRef.current = anelDaElipse(novo.centro, novo.rx, novo.ry)
      } else {
        const original = anelOriginalRef.current
        const vertice = coordenadaDaTela(tela)
        // PREMISSA (lapidação 11): anel de 4 vértices fechado (5 pontos) é um
        // RETÂNGULO — puxar QUALQUER canto o redimensiona em qualquer direção,
        // com o canto OPOSTO ancorado e o rect recomputado pelo cursor (clamp
        // mínimo ~4px por eixo, sem virar/interseção própria — abs trava).
        // Polígonos livres (5+ vértices) e triângulos MANTÊM o movimento de
        // vértice atual.
        if (original.length === 5) {
          const indiceCanto = ((ativa.indice % 4) + 4) % 4
          const oposto = original[(indiceCanto + 2) % 4]
          const dx = vertice[0] - oposto[0]
          const dy = vertice[1] - oposto[1]
          const minX = grausPorPixels(4, 'x')
          const minY = grausPorPixels(4, 'y')
          const canto: [number, number] = [
            Math.abs(dx) < minX ? oposto[0] + Math.sign(dx || 1) * minX : vertice[0],
            Math.abs(dy) < minY ? oposto[1] + Math.sign(dy || 1) * minY : vertice[1],
          ]
          const anel: number[][] = []
          for (let passo = 0; passo < 4; passo += 1) {
            const posicao = (indiceCanto + passo) % 4
            anel[posicao] =
              passo === 0
                ? canto
                : passo === 2
                  ? [...oposto]
                  : passo === 1
                    ? [canto[0], oposto[1]]
                    : [oposto[0], canto[1]]
          }
          anel.push([...anel[0]])
          poligonoEdicaoRef.current = anel
        } else {
          const anel = anelOriginalRef.current.map((ponto, indice) =>
            indice === ativa.indice ? vertice : ponto,
          )
          // O anel é fechado: a alça 0 também define o vértice final.
          if (ativa.indice === 0 && anel.length > 0) {
            anel[anel.length - 1] = [...vertice]
          }
          poligonoEdicaoRef.current = anel
        }
      }
      // Ao vivo: o desenho da área acompanha o gesto direto na fonte.
      atualizarAreaAoVivo(mapRef.current, ativa, poligonoEdicaoRef.current)
      setPoligonoEdicao(poligonoEdicaoRef.current)
      reposicionarAlcas()
      // Quadro do gesto no MESMO tick: contorno + vértices no SVG do DOM.
      atualizarPoligonoGesto(poligonoEdicaoRef.current)
    }
    const aoSoltar = () => {
      finalizarEdicao()
    }
    window.addEventListener('mousemove', aoMover)
    window.addEventListener('mouseup', aoSoltar)
    return () => {
      window.removeEventListener('mousemove', aoMover)
      window.removeEventListener('mouseup', aoSoltar)
    }
  }, [edicao, coordenadaDaTela, grausPorPixels, finalizarEdicao, atualizarAreaAoVivo, reposicionarAlcas, atualizarPoligonoGesto])

  // Se o ponto do pin some do escopo (área apagada, troca de filtro, release
  // de gesto que o tirou da área — a consulta nova não o traz), fechar pin
  // remove tudo: pin + bolha. Durante o GESTO o pin NÃO é avaliado: os pontos
  // são geo-fixos e o conjunto só muda no release.
  useEffect(() => {
    const ativo = pontoAtivoRef.current
    if (!ativo) {
      return
    }
    const visivel = pontosExibidos.some(
      (ponto) => String(ponto.properties.id) === String(ativo.properties.id),
    )
    if (!visivel) {
      removerPinAreaRef.current()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado, buscaResultado, buscaAberto])

  useEffect(
    () => () => {
      if (dicaTimerRef.current) {
        clearTimeout(dicaTimerRef.current)
      }
      if (piscaTimerRef.current) {
        clearTimeout(piscaTimerRef.current)
      }
    },
    [],
  )

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
    const dados = dadosDasAreas(areas, areaAtivaId)
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
    // Durante o gesto a área editada leva `emEdicao: true` — fill/contorno do
    // canvas ficam com opacidade 0 e o quadro vive no DOM (SVG ghost); sem o
    // atributo (fora do gesto), segue o caso ativa/inativa de sempre.
    map.addLayer({
      id: 'camada-area',
      type: 'fill',
      source: 'area-desenhada',
      paint: {
        'fill-color': '#0ea5a4',
        'fill-opacity': ['case', ['get', 'emEdicao'], 0, ['case', ['get', 'ativa'], 0.5, 0.15]],
        'fill-outline-color': ['case', ['get', 'ativa'], '#d97706', '#0f766e'],
      },
    } as never)
    // Contorno data-driven: borda mais grossa/brilhante na área selecionada
    // (âmbar tema, legível sobre o raster em claro e escuro); oculto junto do
    // fill quando a área está em edição.
    map.addLayer({
      id: 'camada-area-contorno',
      type: 'line',
      source: 'area-desenhada',
      paint: {
        'line-color': ['case', ['get', 'ativa'], '#d97706', '#0f766e'],
        'line-width': ['case', ['get', 'ativa'], 3, 1.5],
        'line-opacity': ['case', ['get', 'emEdicao'], 0, 1],
      },
    } as never)
  }, [areas, areaAtivaId, carregado])

  useEffect(() => {
    const temporizador = setTimeout(() => setAnimalAplicado(animalDigitado), 200)
    return () => clearTimeout(temporizador)
  }, [animalDigitado])

  // Busca FTS: debounce de 300ms e respostas obsoletas ignoradas por contador.
  useEffect(() => {
    if (!buscaAberto) {
      return
    }
    const termo = buscaTermo.trim()
    if (!termo) {
      setBuscaResultado(null)
      return
    }
    pedidoBuscaRef.current += 1
    const pedido = pedidoBuscaRef.current
    const temporizador = setTimeout(() => {
      consultarBusca(termo).then((dados) => {
        if (pedido === pedidoBuscaRef.current && dados) {
          setBuscaResultado(dados)
        }
      })
    }, 300)
    return () => {
      clearTimeout(temporizador)
    }
  }, [buscaTermo, buscaAberto])

  // Fix 2 (SPEC-0005): consulta POR ÁREA com cache. O fim de um gesto muda só
  // o polígono de UMA área (mesmos ids) -> re-busca apenas ela (1 POST) e
  // mescla com as respostas cacheadas das demais. Mudar o CONJUNTO de áreas
  // (criar/apagar) ou filtro/animal invalida o cache das áreas afetadas e
  // volta a consultá-las. Corrida: geração global descarta resposta obsoleta.
  useEffect(() => {
    let vivo = true
    const animal = filtro === 'especifica' ? animalAplicado.trim() || null : null
    const ordenar = filtro === 'mais' ? 'mais' : filtro === 'menos' ? 'menos' : null
    const parametros = `${animal ?? ''}|${ordenar ?? ''}`
    const alvos = areaAtivaId ? areas.filter((area) => area.id === areaAtivaId) : areas
    const chaveDe = (area: AreaDesenhada) =>
      `${area.id}|${JSON.stringify(area.polygon)}|${parametros}`
    const cache = resultadosPorAreaRef.current
    const geracao = consultaGeracaoRef.current + 1
    consultaGeracaoRef.current = geracao

    if (!alvos.length) {
      const chave = `__global__|${parametros}`
      const cacheado = cache.get('__global__')
      if (cacheado?.assinatura === chave) {
        setResultado(cacheado.resultado)
        return () => {
          vivo = false
        }
      }
      consultarArea({ poligono: null, animal, ordenar }).then((dados) => {
        if (!vivo || geracao !== consultaGeracaoRef.current) {
          return
        }
        if (dados) {
          cache.set('__global__', { assinatura: chave, resultado: dados })
          setResultado(dados)
        }
      })
      return () => {
        vivo = false
      }
    }

    const pendentes = alvos.filter((area) => cache.get(area.id)?.assinatura !== chaveDe(area))
    if (!pendentes.length) {
      setResultado(mesclarConsultas(alvos.map((area) => cache.get(area.id)?.resultado ?? null)))
      return () => {
        vivo = false
      }
    }
    Promise.all(
      pendentes.map((area) =>
        consultarArea({ poligono: area.polygon, animal, ordenar }).then((dados) => {
          if (!vivo || geracao !== consultaGeracaoRef.current) {
            return
          }
          if (dados) {
            cache.set(area.id, { assinatura: chaveDe(area), resultado: dados })
          }
        }),
      ),
    ).then(() => {
      if (!vivo || geracao !== consultaGeracaoRef.current) {
        return
      }
      setResultado(mesclarConsultas(alvos.map((area) => cache.get(area.id)?.resultado ?? null)))
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
  }, [resultado, buscaResultado, carregado, atualizarPosicoes])

  const removerPinArea = useCallback(() => {
    const pin = pinAreaRef.current
    pinAreaRef.current = null
    pontoAtivoRef.current = null
    setPontoAtivo(null)
    setBolhaAreaAberta(false)
    setPosBolhaArea(null)
    if (pin) {
      despedirPin(pin)
    }
  }, [])

  removerPinAreaRef.current = removerPinArea

  // Fechar bolha MANTÉM o pin (2º clique no mesmo ponto reabre) — escolha
  // documentada da lapidação 4. O pin+bolha só somem de verdade quando o pin
  // é FECHADO: clique livre fora dele no mapa, troca de modo, ou quando o
  // ponto sai do escopo (área apagada/remarcada).
  const fecharBolhaArea = useCallback(() => {
    setBolhaAreaAberta(false)
  }, [])

  const carregarEspeciesGerais = useCallback(async () => {
    if (especiesRef.current) {
      return especiesRef.current
    }
    const dados = await buscarEspecies().catch(() => null)
    if (dados) {
      especiesRef.current = dados
      setEspecies(dados)
    }
    return dados
  }, [])

  // 2º clique no mesmo ponto (ou retorno pela seta da ficha): abre a bolha com
  // a contagem e a lista de espécies visíveis de uma vez (sem Ver espécies).
  const abrirBolhaArea = useCallback(async (ponto?: PontoDaArea) => {
    const alvo = ponto ?? pontoAtivoRef.current
    if (!alvo) {
      return
    }
    ultimoPontoBolhaRef.current = alvo
    const mapa = mapRef.current
    if (mapa) {
      const projetado = mapa.project(alvo.geometry.coordinates)
      setPosBolhaArea({ x: projetado.x, y: projetado.y })
    }
    if (!alvo.properties.especie_slugs.length) {
      await carregarEspeciesGerais()
    }
    setBolhaAreaAberta(true)
  }, [carregarEspeciesGerais])

  // Bolha de área aberta? Esc fecha a bolha (o pin permanece, 2º clique volta).
  useEffect(() => {
    if (!bolhaAreaAberta || modalAberto) {
      return
    }
    const aoTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        fecharBolhaArea()
      }
    }
    document.addEventListener('keydown', aoTeclear)
    return () => document.removeEventListener('keydown', aoTeclear)
  }, [bolhaAreaAberta, modalAberto, fecharBolhaArea])

  // Seta "voltar para a lista" da ficha reabre a bolha do ponto de origem —
  // se o pin saiu (a ficha fecha o pin), ele volta junto da bolha.
  useEffect(() => {
    if (!abrirListagemEm) {
      return
    }
    const ponto = pontoAtivoRef.current ?? ultimoPontoBolhaRef.current
    if (!ponto) {
      return
    }
    if (!pontoAtivoRef.current) {
      criarPinArea(ponto)
    }
    void abrirBolhaArea(ponto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirListagemEm])

  // Fluxo do ponto (lapidação 4): 1º clique sobe o PIN com o ícone do animal,
  // SEM bolha; 2º clique no MESMO ponto abre a bolha com a lista já visível.
  const criarPinArea = useCallback(
    (ponto: PontoDaArea) => {
      // Troca de pin: o velho sai animado enquanto o novo já entra (cada
      // elemento cuida do próprio ciclo, sem estado compartilhado).
      const antigo = pinAreaRef.current
      if (antigo) {
        despedirPin(antigo)
      }
    const mapa = mapRef.current
    if (!mapa) {
      return
    }
    const el = document.createElement('button')
    el.type = 'button'
    el.setAttribute('data-testid', 'pin-area')
    el.setAttribute('aria-label', ponto.properties.nome)
    el.className = 'relative cursor-pointer select-none'
    // Lapidação 11: o pin exibe o SUBCONJUNTO do ponto dentro do conjunto do
    // filtro (sem filtro = todas as espécies do ponto). Lido no ref, o
    // conjunto está vivo na hora do clique.
    el.innerHTML = htmlDoPin(slugsDoFiltroNoPonto(ponto))
    conectarCadeiaDeIcones(el)
    el.addEventListener('mousedown', (evento) => evento.stopPropagation())
    el.addEventListener('click', () => {
      if (modoRef.current === 'medir') {
        marcarMedicao(ponto)
        return
      }
      void abrirBolhaArea()
    })
    pinAreaRef.current = new Marker({ element: el, anchor: 'bottom' })
      .setLngLat(ponto.geometry.coordinates)
      .addTo(mapa)
    pontoAtivoRef.current = ponto
    setPontoAtivo(ponto)
    const projetado = mapa.project(ponto.geometry.coordinates)
    setPosBolhaArea({ x: projetado.x, y: projetado.y })
    setBolhaAreaAberta(false)
  }, [abrirBolhaArea])

  const abrirPonto = useCallback(
    (ponto: PontoDaArea) => {
      if (pontoAtivoRef.current?.properties.id === ponto.properties.id) {
        void abrirBolhaArea()
        return
      }
      criarPinArea(ponto)
    },
    [abrirBolhaArea, criarPinArea],
  )

  // Lapidação 11: quando o conjunto do filtro muda COM pin aberto (novo
  // resultado, filtro trocado ou espécie clicada), o pin é recriado para
  // exibir o subconjunto novo. Bolha aberta permanece aberta: o conteúdo
  // dela já re-renderiza pelo mesmo conjunto.
  const conjuntoVivoRef = useRef(conjuntoFiltro)
  useEffect(() => {
    if (conjuntoVivoRef.current === conjuntoFiltro) {
      return
    }
    conjuntoVivoRef.current = conjuntoFiltro
    const ponto = pontoAtivoRef.current
    if (!ponto) {
      return
    }
    // O ponto pode ter SAÍDO do conjunto com o filtro novo (o efeito do
    // escopo não reavalia em mudanças só de conjunto): fecha pin+bolha.
    if (conjuntoFiltroRef.current.size && slugsDoFiltroNoPonto(ponto).length === 0) {
      removerPinAreaRef.current()
      return
    }
    const bolhaEstavaAberta = bolhaAreaRef.current
    criarPinArea(ponto)
    if (bolhaEstavaAberta) {
      setBolhaAreaAberta(true)
    }
  }, [conjuntoFiltro, criarPinArea])

  const marcarMedicao = (ponto: PontoDaArea) => {
    // Medições só nascem em pontos: A no primeiro, B no segundo, terceiro
    // clique (com A e B preenchidos) reinicia a medição.
    const marca: MarcaMedicao = { ponto }
    setMedicao((atual) => (!atual || atual.b ? { a: marca, b: null } : { a: atual.a, b: marca }))
  }

  const aoClicarPonto = (ponto: PontoDaArea) => {
    if (modo === 'medir') {
      marcarMedicao(ponto)
      return
    }
    abrirPonto(ponto)
  }

  const aoClicarNoMapa = (evento: MouseEvento<HTMLDivElement>) => {
    // Medir: NÃO marca mais com clique livre — só pontos clicáveis marcam
    // (A, depois B). Clique livre dá apenas o feedback curto.
    if (modo === 'medir') {
      const alvo = evento.target as Element
      if (alvo.closest('button') || alvo.closest('.maplibregl-marker')) {
        return
      }
      setDicaMedir(true)
      if (dicaTimerRef.current) {
        clearTimeout(dicaTimerRef.current)
      }
      dicaTimerRef.current = setTimeout(() => setDicaMedir(false), 1600)
      return
    }
    // Modo padrão: FECHAR PIN — clique livre fora de ponto/pin remove o pin e
    // a bolha.
    if (pontoAtivoRef.current) {
      const alvo = evento.target as Element
      if (!alvo.closest('button') && !alvo.closest('.maplibregl-marker')) {
        removerPinArea()
      }
    }
    // Clique livre FORA de qualquer área desenhada desmarca a área selecionada
    // (o próprio polígono selecionado permanece marcado durante o gesto).
    if (modo === 'arrastar' && areaAtivaId) {
      const alvo = evento.target as Element
      if (!alvo.closest('button') && !alvo.closest('.maplibregl-marker')) {
        const coordenada = coordenadaDaTela(telaDoEvento(evento))
        const dentro = areasRef.current.some((area) =>
          pontoNoPoligono(coordenada, area.polygon.coordinates[0] ?? []),
        )
        if (!dentro) {
          setAreaAtivaId(null)
        }
      }
    }
  }

  const selecionarArea = (id: string) => {
    setAreaAtivaId((atual) => (atual === id ? null : id))
  }

  const apagarArea = (id: string) => {
    setAreas((atuais) => atuais.filter((area) => area.id !== id))
    setAreaAtivaId((atual) => (atual === id ? null : atual))
  }

  const nomesDasEspecies = new Map(
    (resultado?.especies ?? []).map((item) => [item.slug, item.nome_popular]),
  )
  const nomeEspecieAplicada = especieSelecionada
    ? nomesDasEspecies.get(especieSelecionada) ??
      buscaResultado?.especies.find((item) => item.slug === especieSelecionada)?.nome_popular ??
      especieSelecionada
    : null

  const posicaoDaMarca = (marca: MarcaMedicao): { x: number; y: number } => {
    const existente = posicoesPontos[String(marca.ponto.properties.id)]
    if (existente) {
      return existente
    }
    const mapa = mapRef.current
    if (!mapa) {
      return { x: 0, y: 0 }
    }
    const projetado = mapa.project(marca.ponto.geometry.coordinates) as { x: number; y: number }
    return { x: projetado.x, y: projetado.y }
  }

  const linhaMedicao = medicao?.b
    ? { a: posicaoDaMarca(medicao.a), b: posicaoDaMarca(medicao.b) }
    : null

  const hullPreview =
    formaDesenho === 'livre'
      ? convexHull(pontosPreview.map((ponto) => [ponto.x, ponto.y])).map(([x, y]) => ({ x, y }))
      : []
  const inicioPreview = pontosPreview[0]
  const atualPreview = pontosPreview[1]
  // Retângulo: largura e altura independentes, ancorado no canto de menor x/y.
  const larguraPreview =
    formaDesenho === 'retangulo' && inicioPreview && atualPreview
      ? Math.abs(atualPreview.x - inicioPreview.x)
      : 0
  const alturaPreview =
    formaDesenho === 'retangulo' && inicioPreview && atualPreview
      ? Math.abs(atualPreview.y - inicioPreview.y)
      : 0
  // Elipse desde o desenho (lapidação 11): preview com rx=|dx| e ry=|dy|
  // de tela, INDEPENDENTES (o gesto já mostra a elipse real, não um círculo).
  const larguraElipsePreview =
    formaDesenho === 'circulo' && inicioPreview && atualPreview
      ? Math.abs(atualPreview.x - inicioPreview.x)
      : 0
  const alturaElipsePreview =
    formaDesenho === 'circulo' && inicioPreview && atualPreview
      ? Math.abs(atualPreview.y - inicioPreview.y)
      : 0

  // Pisca dos pontos: a classe existe APENAS durante a animação (~600ms).
  // Re-selecionar o mesmo filtro re-dispara UMA vez: a key muda para a nova
  // "vez" (remontagem reinicia a animação); ao fim Ko timeout limpa o estado —
  // sem classe residual e sem brilho permanente após selecionar 2x.
  // onAnimationEnd corta cedo nos navegadores que rodam a animação de fato.
  const piscar = (identificador: string) => {
    const vez = ultimaPiscaRef.current + 1
    ultimaPiscaRef.current = vez
    setPisca({ filtro: identificador, vez })
    if (piscaTimerRef.current) {
      clearTimeout(piscaTimerRef.current)
    }
    piscaTimerRef.current = setTimeout(() => setPisca(null), 650)
  }

  const encerraPisca = () => {
    if (pisca) {
      setPisca(null)
    }
  }

  const abrirBusca = () => {
    setBuscaAberto(true)
  }

  const fecharBusca = () => {
    setBuscaAberto(false)
    setBuscaTermo('')
    setBuscaResultado(null)
    if (especiePeloBusca) {
      setEspecieSelecionada(null)
      setEspeciePeloBusca(false)
    }
  }

  const escolherModo = (novo: ModoFerramenta) => {
    fecharBusca()
    // Trocar de modo fecha o pin ativo (fechar pin remove tudo) e limpa
    // medições/previews/dicas pendentes e a seleção de área.
    removerPinArea()
    setModo(novo)
    setMedicao(null)
    setPontosPreview([])
    setDicaMedir(false)
    setSobreArea(false)
    setAreaAtivaId(null)
  }

  const mudarBusca = (termo: string) => {
    setBuscaTermo(termo)
    // Digitar de novo reinicia o destaque de busca como matches do termo atual.
    if (especiePeloBusca) {
      setEspecieSelecionada(null)
      setEspeciePeloBusca(false)
    }
  }

  const escolherAnimalBusca = (slug: string) => {
    setEspecieSelecionada(slug)
    setEspeciePeloBusca(true)
  }

  const aplicarFiltro = (novo: FiltroEspecie) => {
    setFiltro(novo)
  }

  const selecionarEspeciePainel = (slug: string | null) => {
    setEspecieSelecionada(slug)
    setEspeciePeloBusca(false)
  }

  const comMapa = (acao: (map: MapLibreMap) => void) => () => {
    if (mapRef.current) {
      acao(mapRef.current)
    }
  }

  const poligonoEmEdicao = poligonoEdicao ?? areaEmDestaque?.polygon.coordinates[0] ?? null
  // Modelo já COMMITADO na área vence fora do gesto; durante o gesto, o vivo.
  const modeloDestaque = modeloEdicao ?? areaEmDestaque?.modelo ?? null
  let alcasDaArea: { x: number; y: number }[] = []
  if (areaEmDestaque && modo === 'arrastar' && (areaAtivaId === areaEmDestaque.id || !areaAtivaId)) {
    if (modeloDestaque) {
      alcasDaArea = pontosDaElipse(modeloDestaque)
    } else if (poligonoEmEdicao) {
      alcasDaArea = (poligonoEmEdicao ?? [])
        .slice(0, -1)
        .map(
          (vertice) =>
            mapRef.current?.project(vertice as [number, number]) as
              | { x: number; y: number }
              | undefined,
        )
        .filter((ponto): ponto is { x: number; y: number } => Boolean(ponto))
    }
  }

  return (
    <div data-testid="mapa" className="absolute inset-0">
      <div
        ref={containerRef}
        data-testid="mapa-container"
        data-zoom-min="3"
        data-zoom-max="17"
        data-editando={edicao ? 'true' : undefined}
        data-poligono-desenhado={
          areas.length ? JSON.stringify(areas[areas.length - 1].polygon) : undefined
        }
        className={`h-full w-full${modo === 'desenhar' ? ' cursor-crosshair' : ''}${
          modo === 'arrastar' && edicao?.tipo === 'mover' ? ' cursor-grabbing' : ''
        }${modo === 'arrastar' && sobreArea && !edicao ? ' cursor-grab' : ''}`}
        onMouseDown={aoMouseDown}
        onMouseMove={aoMouseMove}
        onMouseUp={aoMouseUp}
        onClick={aoClicarNoMapa}
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
          {formaDesenho === 'retangulo' && larguraPreview > 0 && alturaPreview > 0 && inicioPreview && (
            <rect
              data-testid="preview-retangulo"
              x={Math.min(inicioPreview.x, atualPreview?.x ?? inicioPreview.x)}
              y={Math.min(inicioPreview.y, atualPreview?.y ?? inicioPreview.y)}
              width={larguraPreview}
              height={alturaPreview}
              fill="none"
              stroke="#0f766e"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}
          {formaDesenho === 'circulo' &&
            (larguraElipsePreview > 0 || alturaElipsePreview > 0) &&
            inicioPreview && (
            <ellipse
              data-testid="preview-circulo"
              cx={inicioPreview.x}
              cy={inicioPreview.y}
              rx={larguraElipsePreview}
              ry={alturaElipsePreview}
              fill="none"
              stroke="#0f766e"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}
        </svg>
      )}
      {/* Quadro do gesto (contorno + vértices) 100% no DOM: fill/contorno do
          canvas ficam ocultos (emEdicao) e este SVG acompanha o mousemove por
          setAttribute no mesmo tick — sem ghosting de compositor. */}
      {edicao && poligonoEdicao && (
        <svg
          data-testid="area-gesto"
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          aria-hidden="true"
        >
          <polygon
            ref={poligonoGestoRef}
            data-testid="poligono-gesto"
            points={poligonoEdicao
              .map((vertice) => {
                const projetado = mapRef.current?.project(vertice as [number, number]) as
                  | { x: number; y: number }
                  | undefined
                return projetado ? `${projetado.x},${projetado.y}` : null
              })
              .filter((ponto): ponto is string => ponto !== null)
              .join(' ')}
            fill="#0ea5a4"
            fillOpacity={0.5}
            stroke="#d97706"
            strokeWidth={3}
          />
        </svg>
      )}
      {areaEmDestaque && modo === 'arrastar' && (areaAtivaId === areaEmDestaque.id || !areaAtivaId) && (
        <svg
          ref={alcasSvgRef}
          data-testid="alcas-area"
          data-selecionada={areaAtivaId === areaEmDestaque.id ? 'true' : 'false'}
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          aria-hidden="true"
        >
          {alcasDaArea.map((alca, indice) => {
            return (
              <circle
                key={`${areaEmDestaque.id}-alca-${indice}`}
                data-testid={`alca-${indice}`}
                data-editando={edicao ? 'true' : 'false'}
                cx={alca.x}
                cy={alca.y}
                r={5}
                fill="#ffffff"
                stroke="#0f766e"
                strokeWidth={2}
                className="pointer-events-auto cursor-move"
                onMouseDown={(evento) => {
                  evento.stopPropagation()
                  iniciarEdicao(
                    'alca',
                    areaEmDestaque.id,
                    indice,
                    modeloDestaque ? telaDoEvento(evento) : null,
                    modeloDestaque ? EXTRAS_DA_ELIPSE[indice] : null,
                  )
                }}
              />
            )
          })}
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
        buscaAberto={buscaAberto}
        aoAbrirBusca={abrirBusca}
        aoFecharBusca={fecharBusca}
        termoBusca={buscaTermo}
        aoMudarBusca={mudarBusca}
        resultadosBusca={buscaResultado}
        aoEscolherAnimalBusca={escolherAnimalBusca}
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
        aoEscolherFiltro={aplicarFiltro}
        animal={animalDigitado}
        aoBuscarAnimal={setAnimalDigitado}
        especieSelecionada={especieSelecionada}
        aoSelecionarEspecie={selecionarEspeciePainel}
        escopo={areas.length ? 'area' : 'brasil'}
        especieAplicada={nomeEspecieAplicada}
        aoPiscar={piscar}
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
            distanciaKm(medicao.a.ponto.geometry.coordinates, medicao.b.ponto.geometry.coordinates),
          )}{' '}
          km
        </div>
      )}
      {modo === 'medir' && dicaMedir && (
        <div
          data-testid="dica-medir"
          className="absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground shadow"
        >
          Clique em um ponto para medir
        </div>
      )}
      {pontosExibidos.map((ponto) => {
        const posicao = posicoesPontos[String(ponto.properties.id)]
        if (!posicao) {
          return null
        }
        const marcada = medicao ? medicao.a.ponto?.properties.id === ponto.properties.id : false
        const destacado = especieSelecionada
          ? ponto.properties.especie_slugs.includes(especieSelecionada)
          : buscaAtiva
            ? chavesBusca.has(CHAVE_DO_PONTO(ponto))
            : null
        const classeDestaque =
          destacado === null
            ? 'z-10 size-4 bg-teal-600'
            : destacado
              ? 'z-20 size-6 bg-amber-500 ring-4 ring-amber-400'
              : 'z-10 size-4 opacity-40'
        return (
          <button
            key={`${ponto.properties.id}-${ponto.geometry.coordinates[0]}-${
              ponto.geometry.coordinates[1]
            }-${ultimaPiscaRef.current}`}
            type="button"
            data-testid="ponto-area"
            data-medida={marcada ? 'a' : undefined}
            data-destacado={destacado === null ? undefined : String(destacado)}
            data-pisca={pisca ? pisca.filtro : undefined}
            aria-label={ponto.properties.nome}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${classeDestaque} ${
              marcada ? 'ring-4 ring-amber-400' : ''
            }${pisca ? ' ponto-pisca' : ''}`}
            style={{ left: posicao.x, top: posicao.y }}
            onAnimationEnd={encerraPisca}
            onClick={() => aoClicarPonto(ponto)}
          />
        )
      })}
      {pontoAtivo && bolhaAreaAberta && !modalAberto && posBolhaArea && (
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
          <div data-testid="lista-especies-area">
            <p
              data-testid="bolha-contagem"
              className="px-3 pb-1 pt-3 pr-8 text-sm font-medium leading-snug text-foreground"
            >
              {(() => {
                // Lapidação 11: a contagem reflete o SUBCONJUNTO do filtro
                // (sem filtro = total do ponto, comportamento atual).
                const subconjunto = slugsDoFiltroNoPonto(pontoAtivo)
                if (!subconjunto.length) {
                  return pontoAtivo.properties.descricao
                }
                const contagem = conjuntoFiltro.size
                  ? subconjunto.length
                  : (pontoAtivo.properties.total ?? subconjunto.length)
                return `${contagem} ${contagem === 1 ? 'espécie encontrada' : 'espécies encontradas'}`
              })()}
            </p>
            <ul className="flex max-h-56 flex-col overflow-y-auto p-2 no-scrollbar">
              {(() => {
                // Lapidação 11: só o subconjunto do filtro, na ordem original
                // (sem filtro = todas as espécies do ponto). Ponto sem espécie
                // (só existe sem conjunto) segue listando as gerais.
                const subconjunto = slugsDoFiltroNoPonto(pontoAtivo)
                return subconjunto.length
                  ? subconjunto.map((slug) => (
                      <li key={slug}>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`area-especie-${slug}`}
                          className="w-full justify-start rounded-lg hover:bg-accent"
                          onClick={() => {
                            removerPinArea()
                            onAbrirEspecie?.(slug)
                          }}
                        >
                          {nomesDasEspecies.get(slug) ?? slug}
                        </Button>
                      </li>
                    ))
                  : (especies ?? []).map((item) => (
                      <li key={item.slug}>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`especie-opcao-${item.slug}`}
                          className="w-full justify-start rounded-lg hover:bg-accent"
                          onClick={() => {
                            removerPinArea()
                            onAbrirEspecie?.(item.slug)
                          }}
                        >
                          {item.nome_popular}
                        </Button>
                      </li>
                    ))
              })()}
            </ul>
          </div>
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
