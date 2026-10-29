export type SeloStatus = 'conectado' | 'indisponível'
export type TipoGeometria = 'ponto' | 'linha' | 'poligono'

export type EspecieResumo = {
  slug: string
  nome_popular: string
  nome_cientifico: string | null
  imagem: string
}

export type EspecieDetalhe = EspecieResumo & {
  descricao: string
  infos: Record<string, string | number>
}

export type PropriedadesGeometria = {
  id: number
  nome: string
  tipo: TipoGeometria
  descricao: string
  especie_slug: string | null
  total?: number
}

export type FeatureGeometria = {
  type: 'Feature'
  properties: PropriedadesGeometria
  geometry: {
    type: string
    coordinates: number[] | number[][] | number[][][]
  }
}

export type FeatureCollectionGeometrias = {
  type: 'FeatureCollection'
  features: FeatureGeometria[]
}

export async function buscarPing(): Promise<SeloStatus> {
  try {
    const resposta = await fetch('/api/ping/')
    if (!resposta.ok) {
      return 'indisponível'
    }
    const corpo = (await resposta.json()) as { status?: string }
    return corpo?.status === 'ok' ? 'conectado' : 'indisponível'
  } catch {
    return 'indisponível'
  }
}

export async function buscarEspecies(): Promise<EspecieResumo[] | null> {
  try {
    const resposta = await fetch('/api/especies/')
    if (!resposta.ok) {
      return null
    }
    return (await resposta.json()) as EspecieResumo[]
  } catch {
    return null
  }
}

export async function buscarEspecie(slug: string): Promise<EspecieDetalhe | null> {
  try {
    const resposta = await fetch(`/api/especies/${slug}/`)
    if (!resposta.ok) {
      return null
    }
    return (await resposta.json()) as EspecieDetalhe
  } catch {
    return null
  }
}

export async function buscarGeometrias(): Promise<FeatureCollectionGeometrias | null> {
  try {
    const resposta = await fetch('/api/geometrias/')
    if (!resposta.ok) {
      return null
    }
    return (await resposta.json()) as FeatureCollectionGeometrias
  } catch {
    return null
  }
}

export type PolygonGeoJSON = { type: 'Polygon'; coordinates: number[][][] }

export type EspecieDaArea = { slug: string; nome_popular: string; contagem: number }

export type PontoDaArea = {
  type: 'Feature'
  properties: {
    id: number
    nome: string
    descricao: string
    especie_slugs: string[]
    total: number
  }
  geometry: { type: 'Point'; coordinates: [number, number] }
}

export type ConsultaArea = {
  especies: EspecieDaArea[]
  pontos: { type: 'FeatureCollection'; features: PontoDaArea[] }
}

export async function consultarArea(parametros: {
  poligono: PolygonGeoJSON | null
  animal: string | null
  ordenar: 'mais' | 'menos' | null
}): Promise<ConsultaArea | null> {
  try {
    const resposta = await fetch('/api/consulta/area/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parametros),
    })
    if (!resposta.ok) {
      return null
    }
    return (await resposta.json()) as ConsultaArea
  } catch {
    return null
  }
}
