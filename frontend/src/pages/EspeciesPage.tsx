import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CarrosselEspecie } from '@/components/CarrosselEspecie'
import { EspecieModal } from '@/components/EspecieModal'
import { buscarEspecies, type EspecieResumo } from '@/lib/api'

// Ordem fixa dos carrosséis; qualquer grupo fora dela cai no fim, na ordem em
// que o backend mandar. Rótulos no plural para o título do painel.
const ORDEM_GRUPOS = ['Crustáceo', 'Ave', 'Peixe']
const ROTULO_GRUPO: Record<string, string> = {
  Crustáceo: 'Crustáceos',
  Ave: 'Aves',
  Peixe: 'Peixes',
}
const GRUPO_SEM_INFO = 'Outras espécies'

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
  // Busca no SERVIDOR (FTS com ?q=): debounce de 300ms e respostas obsoletas
  // descartadas por contador — enquanto uma busca carrega, a lista anterior
  // continua pintada (sem flash). `termoAplicadoRef` evita refetch no mount e
  // dispara recarga da lista completa quando a busca volta a zero caracteres.
  const pedidoRef = useRef(0)
  const termoAplicadoRef = useRef<string | null>(null)
  const navegar = useNavigate()

  useEffect(() => {
    pedidoRef.current += 1
    const pedido = pedidoRef.current
    buscarEspecies().then((dados) => {
      if (pedido !== pedidoRef.current) {
        return
      }
      termoAplicadoRef.current = ''
      if (dados) {
        setEspecies(dados)
      } else {
        setIndisponivel(true)
      }
    })
  }, [])

  useEffect(() => {
    const termo = busca.trim()
    if (termo === termoAplicadoRef.current) {
      return
    }
    const temporizador = setTimeout(() => {
      termoAplicadoRef.current = termo
      pedidoRef.current += 1
      const pedido = pedidoRef.current
      buscarEspecies(termo || undefined).then((dados) => {
        if (pedido !== pedidoRef.current) {
          return
        }
        if (dados) {
          setEspecies(dados)
          setIndisponivel(false)
        } else {
          setIndisponivel(true)
        }
      })
    }, 300)
    return () => {
      clearTimeout(temporizador)
    }
  }, [busca])

  const grupos = agrupar(especies ?? [])

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

        <header data-testid="especies-hero" className="mb-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Catálogo
          </p>
          <h1 data-testid="especies-titulo" className="mt-1 text-3xl font-bold tracking-tight">
            Espécies do litoral do Piauí
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Crustáceos, aves e peixes registrados na costa piauiense. Toque em uma foto para
            abrir a ficha.
          </p>
          <div className="mt-3 flex justify-center">
            <span
              data-testid="especies-total"
              className="rounded-full bg-accent px-3 py-1 text-xs font-semibold tabular-nums text-accent-foreground"
            >
              {especies?.length ?? 0}
            </span>
          </div>
        </header>

        <div className="mb-6 flex justify-center">
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

        <div data-testid="especies-grid" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {grupos.map((grupo) => (
            <CarrosselEspecie
              key={grupo.chave}
              testid={`carrossel-${grupo.chave}`}
              titulo={grupo.titulo}
              itens={grupo.itens}
              onAbrir={setSlugAberto}
            />
          ))}
        </div>

        {especies !== null && especies.length === 0 && !indisponivel && (
          <p
            data-testid="busca-vazia"
            className="mt-6 rounded-xl border bg-card p-4 text-center text-sm text-muted-foreground"
          >
            Nenhuma espécie encontrada para a busca.
          </p>
        )}
      </div>
      {slugAberto && <EspecieModal slug={slugAberto} onFechar={() => setSlugAberto(null)} />}
    </section>
  )
}
