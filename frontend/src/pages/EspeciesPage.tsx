import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EspecieModal } from '@/components/EspecieModal'
import { FotoEspecie } from '@/components/FotoEspecie'
import { buscarEspecies, type EspecieResumo } from '@/lib/api'

// Ordem fixa dos carrosséis; qualquer grupo fora dela cai no fim, na ordem em
// que o backend mandar. Rótulos no plural para o título do trilho.
const ORDEM_GRUPOS = ['Crustáceo', 'Ave', 'Peixe']
const ROTULO_GRUPO: Record<string, string> = {
  Crustáceo: 'Crustáceos',
  Ave: 'Aves',
  Peixe: 'Peixes',
}
const GRUPO_SEM_INFO = 'Outras espécies'

// "Full text" no cliente: sem acento e sem caixa, casando em qualquer trecho
// do nome popular ou científico (a lista inteira já está carregada).
function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function agrupar(especies: EspecieResumo[]) {
  const porGrupo = new Map<string, EspecieResumo[]>()
  for (const item of especies) {
    const chave = item.grupo?.trim() || GRUPO_SEM_INFO
    const atual = porGrupo.get(chave)
    if (atual) {
      atual.push(item)
    } else {
      porGrupo.set(chave, [item])
    }
  }
  const chaves = [
    ...ORDEM_GRUPOS.filter((chave) => porGrupo.has(chave)),
    ...[...porGrupo.keys()].filter((chave) => !ORDEM_GRUPOS.includes(chave)),
  ]
  return chaves.map((chave) => ({
    chave,
    titulo: ROTULO_GRUPO[chave] ?? chave,
    itens: porGrupo.get(chave) ?? [],
  }))
}

export function EspeciesPage() {
  const [especies, setEspecies] = useState<EspecieResumo[] | null>(null)
  const [indisponivel, setIndisponivel] = useState(false)
  const [slugAberto, setSlugAberto] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const trilhos = useRef<Record<string, HTMLDivElement | null>>({})
  const navegar = useNavigate()

  useEffect(() => {
    let vivo = true
    buscarEspecies().then((dados) => {
      if (!vivo) {
        return
      }
      if (dados) {
        setEspecies(dados)
      } else {
        setIndisponivel(true)
      }
    })
    return () => {
      vivo = false
    }
  }, [])

  const termo = normalizar(busca.trim())
  const filtradas = (especies ?? []).filter(
    (item) =>
      !termo ||
      normalizar(item.nome_popular).includes(termo) ||
      normalizar(item.nome_cientifico ?? '').includes(termo),
  )
  const grupos = agrupar(filtradas)

  const rolar = (chave: string, direcao: 1 | -1) => {
    const trilho = trilhos.current[chave]
    if (!trilho) {
      return
    }
    trilho.scrollBy({ left: direcao * trilho.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <section
      data-testid="pagina-especies"
      className="absolute inset-0 z-10 overflow-y-auto bg-background px-4 pb-20 pt-20"
    >
      <div className="mx-auto w-full max-w-5xl">
        <Button
          variant="ghost"
          size="sm"
          data-testid="voltar-inicio"
          className="-ml-2 mb-4 text-muted-foreground hover:text-foreground"
          onClick={() => navegar('/inicio')}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar ao mapa
        </Button>

        <header className="mb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Catálogo
          </p>
          <h1 data-testid="especies-titulo" className="mt-1 text-2xl font-bold tracking-tight">
            Espécies do litoral do Piauí
          </h1>
        </header>

        <div className="mb-8 flex justify-center">
          <div className="relative w-full max-w-md">
            <input
              data-testid="busca-especies"
              type="text"
              value={busca}
              placeholder="Buscar por nome popular ou científico"
              aria-label="Buscar espécie por nome"
              onChange={(evento) => setBusca(evento.target.value)}
              className="h-11 w-full rounded-full border bg-card pl-4 pr-11 text-sm shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>

        {indisponivel && (
          <p
            data-testid="especies-indisponivel"
            className="rounded-xl border bg-card p-4 text-sm text-muted-foreground"
          >
            Listagem indisponível no momento. Verifique a conexão.
          </p>
        )}

        {grupos.map((grupo) => (
          <div key={grupo.chave} className="mb-8" data-testid={`carrossel-${grupo.chave}`}>
            <div className="mb-2 flex items-end justify-between gap-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {grupo.titulo}
                <span className="ml-2 font-medium tabular-nums text-muted-foreground/60">
                  {grupo.itens.length}
                </span>
              </h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label={`Anteriores em ${grupo.titulo}`}
                  onClick={() => rolar(grupo.chave, -1)}
                  className="grid size-7 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Próximas em ${grupo.titulo}`}
                  onClick={() => rolar(grupo.chave, 1)}
                  className="grid size-7 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div
              ref={(elemento) => {
                trilhos.current[grupo.chave] = elemento
              }}
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 no-scrollbar"
            >
              {grupo.itens.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  data-testid={`card-especie-${item.slug}`}
                  onClick={() => setSlugAberto(item.slug)}
                  className="group w-52 shrink-0 snap-start overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <div className="relative h-36 w-full overflow-hidden bg-muted">
                    <FotoEspecie
                      slug={item.slug}
                      imagem={item.imagem}
                      alt={item.nome_popular}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    {/* Sombra inferior do card: scrim curto só para o nome
                        ficar legível sobre a foto — nada de gradiente na UI. */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/75 to-transparent"
                    />
                    <span className="absolute inset-x-0 bottom-0 truncate px-3 pb-2 text-sm font-semibold text-white">
                      {item.nome_popular}
                    </span>
                  </div>
                  <p className="min-h-[2.25rem] truncate px-3 py-2 text-[11px] italic text-muted-foreground">
                    {item.nome_cientifico ?? ''}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ))}

        {especies !== null && filtradas.length === 0 && (
          <p
            data-testid="busca-vazia"
            className="rounded-xl border bg-card p-4 text-center text-sm text-muted-foreground"
          >
            Nenhuma espécie encontrada para a busca.
          </p>
        )}
      </div>
      {slugAberto && <EspecieModal slug={slugAberto} onFechar={() => setSlugAberto(null)} />}
    </section>
  )
}
