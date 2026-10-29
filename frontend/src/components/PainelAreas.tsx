import { Trash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatarKm2 } from '@/utils/geo'
import type { PolygonGeoJSON } from '@/lib/api'

export type AreaDesenhada = {
  id: string
  polygon: PolygonGeoJSON
  nome: string
  areaKm2: number
}

interface PainelAreasProps {
  areas: AreaDesenhada[]
  areaAtivaId: string | null
  aoSelecionar: (id: string) => void
  aoApagar: (id: string) => void
}

export function PainelAreas({ areas, areaAtivaId, aoSelecionar, aoApagar }: PainelAreasProps) {
  return (
    <aside
      data-testid="painel-areas"
      className="absolute left-4 top-16 z-20 w-56 rounded-xl border bg-background p-3 shadow-lg"
    >
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Áreas desenhadas
      </h2>
      {areas.length === 0 ? (
        <p data-testid="areas-vazia" className="text-xs text-muted-foreground">
          Nenhuma área desenhada ainda.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {areas.map((area) => (
            <li
              key={area.id}
              data-testid={`area-item-${area.id}`}
              data-ativa={areaAtivaId === area.id ? 'true' : 'false'}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                areaAtivaId === area.id ? 'border-teal-600 bg-accent' : ''
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
    </aside>
  )
}
