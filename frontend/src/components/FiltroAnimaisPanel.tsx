import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EspecieDaArea } from '@/lib/api'

export type FiltroEspecie = 'todas' | 'mais' | 'menos' | 'especifica'

const OPCOES: { id: FiltroEspecie; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas as espécies' },
  { id: 'mais', rotulo: 'Mais presente' },
  { id: 'menos', rotulo: 'Menos presente' },
  { id: 'especifica', rotulo: 'Animal específico' },
]

const ROTULOS_APLICADO: Record<FiltroEspecie, string> = {
  todas: 'Todas as espécies',
  mais: 'Mais presente',
  menos: 'Menos presente',
  especifica: 'Animal específico',
}

// Hover = tom do primário mais claro que o ativo (lapidação 4): nada de
// cinza/escuro no hover de botão não ativo.
const CLASSE_ATIVA = 'bg-primary text-primary-foreground hover:bg-primary/90'
const CLASSE_HOVER = 'transition-colors hover:bg-primary/60 hover:text-primary-foreground'

interface FiltroAnimaisPanelProps {
  especies: EspecieDaArea[]
  filtro: FiltroEspecie
  aoEscolherFiltro: (filtro: FiltroEspecie) => void
  animal: string
  aoBuscarAnimal: (texto: string) => void
  especieSelecionada: string | null
  aoSelecionarEspecie: (slug: string | null) => void
  escopo: 'brasil' | 'area'
  especieAplicada: string | null
  aoPiscar: (identificador: string) => void
}

export function FiltroAnimaisPanel({
  especies,
  filtro,
  aoEscolherFiltro,
  animal,
  aoBuscarAnimal,
  especieSelecionada,
  aoSelecionarEspecie,
  escopo,
  especieAplicada,
  aoPiscar,
}: FiltroAnimaisPanelProps) {
  // O painel minimizado só esconde o corpo: filtro/escopo/espécies seguem
  // intactos — minimizar NÃO reinicia estado.
  const [aberto, setAberto] = useState(true)
  const rotuloEscopo = escopo === 'brasil' ? 'todo o Brasil' : 'área desenhada'
  const textoAplicado = especieAplicada
    ? `${especieAplicada}`
    : filtro === 'especifica' && animal.trim()
      ? animal.trim()
      : ROTULOS_APLICADO[filtro]
  // Chip "Filtrando por: X" só existe quando X não é o filtro padrão.
  const chipVisivel = textoAplicado !== ROTULOS_APLICADO.todas
  return (
    <aside
      data-testid="painel-filtros"
      className="absolute right-4 top-16 z-20 w-64 rounded-xl border bg-background p-4 shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Filtros
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          data-testid="recolher-filtros"
          aria-label={aberto ? 'Recolher filtros' : 'Expandir filtros'}
          aria-expanded={aberto}
          title={aberto ? 'Recolher' : 'Expandir'}
          className={CLASSE_HOVER}
          onClick={() => setAberto((atual) => !atual)}
        >
          {aberto ? (
            <ChevronUp className="size-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3" aria-hidden="true" />
          )}
        </Button>
      </div>
      <div
        data-testid="corpo-filtros"
        data-aberto={aberto ? 'true' : 'false'}
        aria-hidden={!aberto}
        className={`flex flex-col gap-2 overflow-hidden transition-all duration-300 ease-out ${
          aberto ? 'max-h-96 opacity-100' : 'pointer-events-none max-h-0 opacity-0'
        }`}
      >
        <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Ordenar por
        </p>
        <ul className="flex flex-col gap-1">
          {OPCOES.map((opcao) => {
            const ativo = filtro === opcao.id
            return (
              <li key={opcao.id}>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`filtro-${opcao.id}`}
                  data-ativo={ativo ? 'true' : 'false'}
                  aria-pressed={ativo}
                  onClick={() => {
                    aoEscolherFiltro(opcao.id)
                    aoPiscar(`filtro-${opcao.id}`)
                  }}
                  className={`w-full justify-start ${ativo ? CLASSE_ATIVA : CLASSE_HOVER}`}
                >
                  {opcao.rotulo}
                </Button>
              </li>
            )
          })}
        </ul>
        {filtro === 'especifica' && (
          <input
            data-testid="filtro-animal"
            type="text"
            value={animal}
            placeholder="Nome do animal"
            aria-label="Nome do animal"
            onChange={(evento) => aoBuscarAnimal(evento.target.value)}
            className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
        {chipVisivel && (
          <p
            data-testid="filtro-aplicado"
            className="w-fit rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
          >
            Filtrando por: {textoAplicado}
          </p>
        )}
        {especies.length > 0 && (
          <div className="flex flex-col gap-1">
            <p
              data-testid="filtro-especies-titulo"
              className="px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Espécies em {rotuloEscopo}
            </p>
            <ul className="flex max-h-[7.5rem] flex-col gap-1 overflow-y-auto no-scrollbar">
              {especies.map((item) => {
                const ativo = especieSelecionada === item.slug
                return (
                  <li key={item.slug}>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`filtro-especie-${item.slug}`}
                      data-ativo={ativo ? 'true' : 'false'}
                      aria-pressed={ativo}
                      onClick={() => {
                        aoSelecionarEspecie(ativo ? null : item.slug)
                        aoPiscar(`filtro-especie-${item.slug}`)
                      }}
                      className={`w-full justify-between text-xs ${ativo ? 'bg-accent text-accent-foreground hover:bg-accent/90' : `${CLASSE_HOVER} text-foreground`}`}
                    >
                      <span className="truncate">{item.nome_popular}</span>
                      <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                        {item.contagem}
                      </span>
                    </Button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
      <p data-testid="filtro-escopo" className="mt-2 text-[11px] text-muted-foreground">
        Escopo: {rotuloEscopo}
      </p>
    </aside>
  )
}
