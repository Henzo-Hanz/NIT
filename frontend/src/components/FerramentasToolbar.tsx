import { useEffect, useRef, useState, type MouseEvent as MouseEvento } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Hand, Pencil, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ModoFerramenta = 'arrastar' | 'desenhar' | 'medir'

interface FerramentasToolbarProps {
  modo: ModoFerramenta
  aoEscolherModo: (modo: ModoFerramenta) => void
  colapsada: boolean
  aoAlternarColapso: () => void
  aoPesquisar?: () => void
}

export function FerramentasToolbar({
  modo,
  aoEscolherModo,
  colapsada,
  aoAlternarColapso,
  aoPesquisar,
}: FerramentasToolbarProps) {
  const [posicao, setPosicao] = useState<{ left: number; top: number } | null>(null)
  const arrastoRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  useEffect(() => {
    const aoMover = (evento: MouseEvent) => {
      const arrasto = arrastoRef.current
      if (!arrasto) {
        return
      }
      setPosicao({
        left: arrasto.left + (evento.clientX - arrasto.x),
        top: arrasto.top + (evento.clientY - arrasto.y),
      })
    }
    const aoSoltar = () => {
      arrastoRef.current = null
    }
    window.addEventListener('mousemove', aoMover)
    window.addEventListener('mouseup', aoSoltar)
    return () => {
      window.removeEventListener('mousemove', aoMover)
      window.removeEventListener('mouseup', aoSoltar)
    }
  }, [])

  const aoIniciarArrasto = (evento: MouseEvento<HTMLDivElement>) => {
    if ((evento.target as Element).closest('button')) {
      return
    }
    const rect = evento.currentTarget.getBoundingClientRect()
    const pai = evento.currentTarget.offsetParent as HTMLElement | null
    const rectPai = pai?.getBoundingClientRect()
    arrastoRef.current = {
      x: evento.clientX,
      y: evento.clientY,
      left: rect.left - (rectPai?.left ?? 0),
      top: rect.top - (rectPai?.top ?? 0),
    }
  }

  const classe = posicao
    ? 'absolute z-20 flex items-center gap-1 rounded-xl border bg-background p-1 shadow-lg'
    : 'absolute left-1/2 top-16 z-20 flex items-center gap-1 rounded-xl border bg-background p-1 shadow-lg -translate-x-1/2'

  return (
    <div
      data-testid="ferramentas"
      className={classe}
      style={posicao ?? undefined}
      onMouseDown={aoIniciarArrasto}
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
          <span
            data-testid="ferramenta-grip"
            aria-hidden="true"
            className="cursor-grab select-none px-0.5 text-muted-foreground"
          >
            <GripVertical className="size-3.5" />
          </span>
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
            data-testid="ferramenta-medir"
            aria-label="Medir distância entre pontos"
            aria-pressed={modo === 'medir'}
            onClick={() => aoEscolherModo('medir')}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeDasharray="4 3"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 20 20 4" />
              <path d="M4 16v4h4" />
              <path d="M20 8V4h-4" />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="ferramenta-pesquisar"
            aria-label="Pesquisar espécies"
            onClick={() => aoPesquisar?.()}
          >
            <Search className="size-4" aria-hidden="true" />
          </Button>
        </>
      )}
    </div>
  )
}
