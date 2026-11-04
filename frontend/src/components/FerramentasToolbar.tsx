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
import type { ResultadoBusca } from '@/lib/api'

export type ModoFerramenta = 'arrastar' | 'desenhar' | 'medir'
export type FormaDesenho = 'livre' | 'retangulo' | 'circulo'

interface FerramentasToolbarProps {
  modo: ModoFerramenta
  aoEscolherModo: (modo: ModoFerramenta) => void
  formaDesenho: FormaDesenho
  aoEscolherForma: (forma: FormaDesenho) => void
  colapsada: boolean
  aoAlternarColapso: () => void
  buscaAberto: boolean
  aoAbrirBusca: () => void
  aoFecharBusca: () => void
  termoBusca: string
  aoMudarBusca: (termo: string) => void
  resultadosBusca: ResultadoBusca | null
  aoEscolherAnimalBusca: (slug: string) => void
}

// Hover por tema (lapidação 5): no claro volta ao cinza suave (muted), como
// antes da lapidação 4; no escuro clara no primário sem branquear. Ativo fica
// no primário pleno e escurece só um pouco no hover.
const CLASSE_ATIVA =
  'bg-primary text-primary-foreground hover:bg-primary/90 dark:hover:bg-primary/90'
const CLASSE_HOVER =
  'transition-colors hover:bg-muted hover:text-foreground dark:hover:bg-primary/60 dark:hover:text-primary-foreground'

export function FerramentasToolbar({
  modo,
  aoEscolherModo,
  formaDesenho,
  aoEscolherForma,
  colapsada,
  aoAlternarColapso,
  buscaAberto,
  aoAbrirBusca,
  aoFecharBusca,
  termoBusca,
  aoMudarBusca,
  resultadosBusca,
  aoEscolherAnimalBusca,
}: FerramentasToolbarProps) {
  const [posicao, setPosicao] = useState<{ left: number; top: number } | null>(null)
  const [submenuAberto, setSubmenuAberto] = useState(false)
  const arrastoRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const campoBuscaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (buscaAberto) {
      campoBuscaRef.current?.focus()
    }
  }, [buscaAberto])

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

  const abrirBusca = () => {
    setSubmenuAberto(false)
    aoAbrirBusca()
  }

  const alternarColapso = () => {
    setSubmenuAberto(false)
    aoFecharBusca()
    aoAlternarColapso()
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
        title={colapsada ? 'Expandir' : 'Recolher'}
        aria-expanded={!colapsada}
        className={CLASSE_HOVER}
        onClick={alternarColapso}
      >
        {colapsada ? (
          <ChevronDown className="size-4" aria-hidden="true" />
        ) : (
          <ChevronUp className="size-4" aria-hidden="true" />
        )}
      </Button>
      {!colapsada && (
        <div
          className={`relative flex items-center transition-all duration-300 ease-out ${
            buscaAberto ? 'w-64' : ''
          }`}
        >
          <div
            data-testid="ferramentas-principal"
            className={`flex items-center gap-1 transition-all duration-300 ease-out ${
              submenuAberto || buscaAberto
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
              title="Desenhar"
              className={modo === 'desenhar' ? CLASSE_ATIVA : CLASSE_HOVER}
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
              title="Arrastar"
              className={modo === 'arrastar' ? CLASSE_ATIVA : CLASSE_HOVER}
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
              title="Medir"
              className={modo === 'medir' ? CLASSE_ATIVA : CLASSE_HOVER}
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
              aria-label="Pesquisar"
              title="Pesquisar"
              aria-pressed={buscaAberto}
              data-ativo={buscaAberto ? 'true' : 'false'}
              className={buscaAberto ? CLASSE_ATIVA : CLASSE_HOVER}
              onClick={abrirBusca}
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
              title="Voltar"
              className={CLASSE_HOVER}
              onClick={() => setSubmenuAberto(false)}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="desenho-retangulo"
              data-ativo={formaDesenho === 'retangulo' ? 'true' : 'false'}
              aria-label="Desenhar retângulo"
              aria-pressed={formaDesenho === 'retangulo'}
              title="Retângulo"
              className={formaDesenho === 'retangulo' ? CLASSE_ATIVA : CLASSE_HOVER}
              onClick={() => escolherForma('retangulo')}
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
              title="Círculo"
              className={formaDesenho === 'circulo' ? CLASSE_ATIVA : CLASSE_HOVER}
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
              title="Livre"
              className={formaDesenho === 'livre' ? CLASSE_ATIVA : CLASSE_HOVER}
              onClick={() => escolherForma('livre')}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <div
            data-testid="caixa-busca"
            data-aberto={buscaAberto ? 'true' : 'false'}
            aria-hidden={!buscaAberto}
            className={`absolute inset-0 flex items-center gap-1 transition-all duration-300 ease-out ${
              buscaAberto
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none -translate-y-6 opacity-0'
            }`}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="busca-voltar"
              aria-label="Voltar para as ferramentas"
              title="Voltar"
              className={CLASSE_HOVER}
              onClick={aoFecharBusca}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>
            <input
              ref={campoBuscaRef}
              data-testid="campo-busca"
              type="text"
              value={termoBusca}
              placeholder="Buscar espécie..."
              aria-label="Buscar espécies ou locais"
              onChange={(evento) => aoMudarBusca(evento.target.value)}
              className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {buscaAberto && (resultadosBusca?.especies.length ?? 0) > 0 && (
            <div
              data-testid="resultado-busca"
              className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border bg-background p-1.5 shadow-lg"
            >
              <ul className="flex max-h-[7.5rem] flex-col overflow-y-auto no-scrollbar">
                {(resultadosBusca?.especies ?? []).map((item) => (
                  <li key={item.slug}>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`resultado-animal-${item.slug}`}
                      className={`w-full justify-start rounded-lg ${CLASSE_HOVER}`}
                      onClick={() => aoEscolherAnimalBusca(item.slug)}
                    >
                      {item.nome_popular}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
