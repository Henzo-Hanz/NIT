import { useState } from 'react'
import { ChevronDown, ChevronUp, Trash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatarKm2 } from '@/utils/geo'
import type { PolygonGeoJSON } from '@/lib/api'

export type ModeloElipse = {
  tipo: 'elipse'
  centro: [number, number]
  rx: number
  ry: number
}

export type AreaDesenhada = {
  id: string
  polygon: PolygonGeoJSON
  nome: string
  areaKm2: number
  modelo?: ModeloElipse
}

interface PainelAreasProps {
  areas: AreaDesenhada[]
  areaAtivaId: string | null
  aoSelecionar: (id: string) => void
  aoApagar: (id: string) => void
}

export function PainelAreas({ areas, areaAtivaId, aoSelecionar, aoApagar }: PainelAreasProps) {
  // Minimizado só esconde o corpo: as áreas continuam no estado do mapa,
  // reabrir não perde nem reseta nada.
  const [aberto, setAberto] = useState(true)
  return (
    <aside
      data-testid="painel-areas"
      className="absolute left-4 top-16 z-20 w-56 rounded-xl border bg-background p-3 shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Áreas desenhadas
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          data-testid="recolher-areas"
          aria-label={aberto ? 'Recolher áreas' : 'Expandir áreas'}
          aria-expanded={aberto}
          title={aberto ? 'Recolher' : 'Expandir'}
          className="transition-colors hover:bg-primary/60 hover:text-primary-foreground"
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
        data-testid="corpo-areas"
        data-aberto={aberto ? 'true' : 'false'}
        aria-hidden={!aberto}
        className={`overflow-hidden transition-all duration-300 ease-out ${
          aberto ? 'max-h-64 opacity-100' : 'pointer-events-none max-h-0 opacity-0'
        }`}
      >
        {areas.length === 0 ? (
          <p data-testid="areas-vazia" className="text-xs text-muted-foreground">
            Nenhuma área desenhada ainda.
          </p>
        ) : (
          <ul className="flex max-h-[7.5rem] flex-col gap-1 overflow-y-auto no-scrollbar">
            {areas.map((area) => (
              <li
                key={area.id}
                data-testid={`area-item-${area.id}`}
                data-ativa={areaAtivaId === area.id ? 'true' : 'false'}
                data-selecionada={areaAtivaId === area.id ? 'true' : 'false'}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${
                  areaAtivaId === area.id
                    ? 'border-2 border-amber-500 bg-amber-500/15 ring-1 ring-amber-400/50 dark:border-amber-400 dark:bg-amber-400/10 dark:ring-amber-500/50'
                    : ''
                }`}
              >
                <span className="font-medium">{area.nome}</span>
                <span data-testid={`area-tamanho-${area.id}`} className="text-muted-foreground">
                  ≈ {formatarKm2(area.areaKm2)} km²
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`selecionar-area-${area.id}`}
                  aria-pressed={areaAtivaId === area.id}
                  aria-label={`Selecionar ${area.nome}`}
                  className="ml-auto h-6 px-1.5 text-[11px]"
                  onClick={() => aoSelecionar(area.id)}
                >
                  Selecionar
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  data-testid={`apagar-area-${area.id}`}
                  aria-label={`Apagar ${area.nome}`}
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => aoApagar(area.id)}
                >
                  <Trash className="size-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
