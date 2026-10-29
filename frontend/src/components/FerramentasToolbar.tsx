import { ChevronDown, ChevronUp, Hand, Pencil, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ModoFerramenta = 'arrastar' | 'desenhar'

interface FerramentasToolbarProps {
  modo: ModoFerramenta
  aoEscolherModo: (modo: ModoFerramenta) => void
  colapsada: boolean
  aoAlternarColapso: () => void
}

export function FerramentasToolbar({
  modo,
  aoEscolherModo,
  colapsada,
  aoAlternarColapso,
}: FerramentasToolbarProps) {
  return (
    <div
      data-testid="ferramentas"
      className="absolute left-4 top-16 z-20 flex items-center gap-1 rounded-xl border bg-background p-1 shadow-lg"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        data-testid="ferramenta-recolher"
        aria-label={colapsada ? 'Expandir ferramentas' : 'Recolher ferramentas'}
        aria-expanded={!colapsada}
        onClick={aoAlternarColapso}
      >
        {colapsada ? (
          <ChevronDown className="size-4" aria-hidden="true" />
        ) : (
          <ChevronUp className="size-4" aria-hidden="true" />
        )}
      </Button>
      {!colapsada && (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="ferramenta-desenhar"
            aria-label="Desenhar área"
            aria-pressed={modo === 'desenhar'}
            onClick={() => aoEscolherModo('desenhar')}
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="ferramenta-arrastar"
            aria-label="Arrastar o mapa"
            aria-pressed={modo === 'arrastar'}
            onClick={() => aoEscolherModo('arrastar')}
          >
            <Hand className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="ferramenta-pesquisar"
            aria-label="Pesquisar (em breve)"
            disabled
          >
            <Search className="size-4" aria-hidden="true" />
          </Button>
        </>
      )}
    </div>
  )
}
