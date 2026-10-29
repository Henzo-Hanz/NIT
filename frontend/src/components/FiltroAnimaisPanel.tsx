import { Button } from '@/components/ui/button'
import type { EspecieDaArea } from '@/lib/api'

export type FiltroEspecie = 'todas' | 'mais' | 'menos' | 'especifica'

const OPCOES: { id: FiltroEspecie; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas as espécies' },
  { id: 'mais', rotulo: 'Mais presente' },
  { id: 'menos', rotulo: 'Menos presente' },
  { id: 'especifica', rotulo: 'Animal específico' },
]

interface FiltroAnimaisPanelProps {
  especies: EspecieDaArea[]
  filtro: FiltroEspecie
  aoEscolherFiltro: (filtro: FiltroEspecie) => void
  animal: string
  aoBuscarAnimal: (texto: string) => void
  especieSelecionada: string | null
  aoSelecionarEspecie: (slug: string | null) => void
  escopo: 'brasil' | 'area'
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
}: FiltroAnimaisPanelProps) {
  return (
    <aside
      data-testid="painel-filtros"
      className="absolute right-4 top-16 z-20 w-64 rounded-xl border bg-background p-4 shadow-lg"
    >
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Filtros
      </h2>
      <ul className="flex flex-col gap-1">
        {OPCOES.map((opcao) => (
          <li key={opcao.id}>
            <Button
              variant="ghost"
              size="sm"
              data-testid={`filtro-${opcao.id}`}
              aria-pressed={filtro === opcao.id}
              onClick={() => aoEscolherFiltro(opcao.id)}
              className="w-full justify-start"
            >
              {opcao.rotulo}
            </Button>
          </li>
        ))}
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
      <p data-testid="filtro-escopo" className="mt-3 text-xs text-muted-foreground">
        Escopo: {escopo === 'brasil' ? 'todo o Brasil' : 'área desenhada'}
      </p>
      {especies.length > 0 && (
        <ul className="mt-2 flex max-h-48 flex-col overflow-y-auto no-scrollbar">
          {especies.map((item) => (
            <li key={item.slug}>
              <Button
                variant="ghost"
                size="sm"
                data-testid={`filtro-especie-${item.slug}`}
                aria-pressed={especieSelecionada === item.slug}
                onClick={() =>
                  aoSelecionarEspecie(especieSelecionada === item.slug ? null : item.slug)
                }
                className={`w-full justify-start ${
                  especieSelecionada === item.slug ? 'bg-accent text-accent-foreground' : ''
                }`}
              >
                {item.nome_popular} ({item.contagem})
              </Button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
