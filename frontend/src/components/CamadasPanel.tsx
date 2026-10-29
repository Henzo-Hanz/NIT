import { Button } from '@/components/ui/button'
import type { TipoGeometria } from '@/lib/api'

const ROTULOS: Record<TipoGeometria, string> = {
  ponto: 'Pontos',
  linha: 'Linhas',
  poligono: 'Polígonos',
}

const TIPOS = Object.keys(ROTULOS) as TipoGeometria[]

interface CamadasPanelProps {
  camadasAtivas: Record<TipoGeometria, boolean>
  aoAlternar: (tipo: TipoGeometria) => void
}

export function CamadasPanel({ camadasAtivas, aoAlternar }: CamadasPanelProps) {
  return (
    <aside
      data-testid="painel-camadas"
      className="absolute right-4 top-16 z-20 w-64 rounded-xl border bg-background p-4 shadow-lg"
    >
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Camadas
      </h2>
      <ul className="flex flex-col gap-1">
        {TIPOS.map((tipo) => (
          <li key={tipo}>
            <Button
              variant="ghost"
              size="sm"
              data-testid={`camada-${tipo}`}
              aria-pressed={camadasAtivas[tipo]}
              onClick={() => aoAlternar(tipo)}
              className="w-full justify-start"
            >
              <span
                className={`mr-2 inline-block h-2 w-2 rounded-full ${
                  camadasAtivas[tipo] ? 'bg-primary' : 'bg-muted-foreground/40'
                }`}
              />
              {ROTULOS[tipo]}
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Filtros por tipo de geometria — dados do backend.
      </p>
    </aside>
  )
}
