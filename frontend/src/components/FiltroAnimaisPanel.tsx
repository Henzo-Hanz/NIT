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

const CLASSE_ATIVA = 'bg-primary text-primary-foreground hover:bg-primary/90'
const CLASSE_HOVER =
  'transition-colors hover:bg-muted hover:text-foreground hover:ring-1 hover:ring-border'

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
  const textoAplicado = especieAplicada
    ? `Filtrando por: ${especieAplicada}`
    : `Filtrando por: ${
        filtro === 'especifica' && animal.trim() ? animal.trim() : ROTULOS_APLICADO[filtro]
      }`
  return (
    <aside
      data-testid="painel-filtros"
      className="absolute right-4 top-16 z-20 w-64 rounded-xl border bg-background p-4 shadow-lg"
    >
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Filtros
      </h2>
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
          className="mt-2 w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
      <p
        data-testid="filtro-aplicado"
        className="mt-2 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
      >
        {textoAplicado}
      </p>
      <p data-testid="filtro-escopo" className="mt-2 text-xs text-muted-foreground">
        Escopo: {escopo === 'brasil' ? 'todo o Brasil' : 'área desenhada'}
      </p>
      {especies.length > 0 && (
        <ul className="mt-2 flex max-h-[7.5rem] flex-col overflow-y-auto no-scrollbar">
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
                  className={`w-full justify-start ${ativo ? 'bg-accent text-accent-foreground' : CLASSE_HOVER}`}
                >
                  {item.nome_popular} ({item.contagem})
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
