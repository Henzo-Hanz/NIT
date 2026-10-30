import { useEffect, useRef, useState, type MouseEvent as MouseEvento } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Circle,
  GripVertical,
  Hand,
  Pencil,
  Search,
  Square,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ModoFerramenta = 'arrastar' | 'desenhar' | 'medir'
export type FormaDesenho = 'livre' | 'quadrado' | 'circulo'

interface FerramentasToolbarProps {
  modo: ModoFerramenta
  aoEscolherModo: (modo: ModoFerramenta) => void
  formaDesenho: FormaDesenho
  aoEscolherForma: (forma: FormaDesenho) => void
  colapsada: boolean
  aoAlternarColapso: () => void
  aoPesquisar?: () => void
}

const CLASSE_ATIVA = 'bg-primary text-primary-foreground hover:bg-primary/90'

export function FerramentasToolbar({
  modo,
  aoEscolherModo,
  formaDesenho,
  aoEscolherForma,
  colapsada,
  aoAlternarColapso,
  aoPesquisar,
}: FerramentasToolbarProps) {
  const [posicao, setPosicao] = useState<{ left: number; top: number } | null>(null)
  const [submenuAberto, setSubmenuAberto] = useState(false)
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

  const escolherModo = (novo: ModoFerramenta) => {
    setSubmenuAberto(false)
    aoEscolherModo(novo)
  }

  const abrirDesenho = () => {
    setSubmenuAberto(true)
    aoEscolherModo('desenhar')
  }

  const escolherForma = (forma: FormaDesenho) => {
    aoEscolherForma(forma)
    aoEscolherModo('desenhar')
    setSubmenuAberto(false)
  }

  const classe = posicao
    ? 'absolute z-20 flex items-center gap-1 rounded-xl border bg-background p-1 shadow-lg'
    : 'absolute left-1/2 top-16 z-20 flex items-center gap-1 rounded-xl border bg-background p-1 shadow-lg -translate-x-1/2'

  return (
    <div
      data-testid="ferramentas"
      className={`${classe} relative`}
      style={posicao ?? undefined}
      onMouseDown={aoIniciarArrasto}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        data-testid="ferramenta-recolher"
        aria-label={colapsada ? 'Expandir ferramentas' : 'Recolher ferramentas'}
        aria-expanded={!colapsada}
        onClick={() => {
          setSubmenuAberto(false)
          aoAlternarColapso()
        }}
      >
        {colapsada ? (
          <ChevronDown className="size-4" aria-hidden="true" />
        ) : (
          <ChevronUp className="size-4" aria-hidden="true" />
        )}
      </Button>
      {!colapsada && (
        <div className="relative flex items-center">
          <div
            data-testid="ferramentas-principal"
            className={`flex items-center gap-1 transition-all duration-300 ease-out ${
              submenuAberto
                ? 'pointer-events-none translate-y-6 opacity-0'
                : 'translate-y-0 opacity-100'
            }`}
          >
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
              data-ativo={modo === 'desenhar' ? 'true' : 'false'}
              aria-label="Desenhar área"
              aria-pressed={modo === 'desenhar'}
              className={modo === 'desenhar' ? CLASSE_ATIVA : undefined}
              onClick={abrirDesenho}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="ferramenta-arrastar"
              data-ativo={modo === 'arrastar' ? 'true' : 'false'}
              aria-label="Arrastar o mapa"
              aria-pressed={modo === 'arrastar'}
              className={modo === 'arrastar' ? CLASSE_ATIVA : undefined}
              onClick={() => escolherModo('arrastar')}
            >
              <Hand className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="ferramenta-medir"
              data-ativo={modo === 'medir' ? 'true' : 'false'}
              aria-label="Medir distância entre pontos"
              aria-pressed={modo === 'medir'}
              className={modo === 'medir' ? CLASSE_ATIVA : undefined}
              onClick={() => escolherModo('medir')}
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
          </div>
          <div
            data-testid="ferramentas-desenho"
            data-aberto={submenuAberto ? 'true' : 'false'}
            aria-hidden={!submenuAberto}
            className={`absolute inset-0 flex items-center justify-center gap-1 transition-all duration-300 ease-out ${
              submenuAberto
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none -translate-y-6 opacity-0'
            }`}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="desenho-voltar"
              aria-label="Voltar para as ferramentas"
              onClick={() => setSubmenuAberto(false)}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="desenho-quadrado"
              data-ativo={formaDesenho === 'quadrado' ? 'true' : 'false'}
              aria-label="Desenhar quadrado"
              aria-pressed={formaDesenho === 'quadrado'}
              className={formaDesenho === 'quadrado' ? CLASSE_ATIVA : undefined}
              onClick={() => escolherForma('quadrado')}
            >
              <Square className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="desenho-circulo"
              data-ativo={formaDesenho === 'circulo' ? 'true' : 'false'}
              aria-label="Desenhar círculo"
              aria-pressed={formaDesenho === 'circulo'}
              className={formaDesenho === 'circulo' ? CLASSE_ATIVA : undefined}
              onClick={() => escolherForma('circulo')}
            >
              <Circle className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="desenho-livre"
              data-ativo={formaDesenho === 'livre' ? 'true' : 'false'}
              aria-label="Desenhar livremente"
              aria-pressed={formaDesenho === 'livre'}
              className={formaDesenho === 'livre' ? CLASSE_ATIVA : undefined}
              onClick={() => escolherForma('livre')}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
