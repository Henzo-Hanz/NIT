import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { descricoesAtivas, escutarDescricoes } from '@/lib/descricoes'

const ATRASO_MS = 1700

interface TooltipDescricaoProps {
  descricao: string
  children: ReactNode
  // O botão que liga/desliga as descrições precisa explicar a própria função
  // mesmo com as descrições desligadas.
  sempreVisivel?: boolean
}

// Caixa de descrição breve que surge 1,7s depois que o mouse para sobre o
// conteúdo. Usa portal + posição fixa para não ser cortada pelo overflow da
// toolbar e para flutuar acima do mapa e da header.
export function TooltipDescricao({ descricao, children, sempreVisivel = false }: TooltipDescricaoProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const tempo = useRef<number | null>(null)
  const [ativo, setAtivo] = useState(descricoesAtivas)
  const [posicao, setPosicao] = useState<{ left: number; top: number } | null>(null)
  const [visivel, setVisivel] = useState(false)

  useEffect(() => escutarDescricoes(() => setAtivo(descricoesAtivas())), [])

  useEffect(
    () => () => {
      if (tempo.current !== null) {
        window.clearTimeout(tempo.current)
      }
    },
    [],
  )

  if (!ativo && !sempreVisivel) {
    return <span className="relative inline-flex">{children}</span>
  }

  const entrar = () => {
    tempo.current = window.setTimeout(() => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) {
        return
      }
      setPosicao({ left: rect.left + rect.width / 2, top: rect.bottom })
      setVisivel(true)
    }, ATRASO_MS)
  }

  const sair = () => {
    if (tempo.current !== null) {
      window.clearTimeout(tempo.current)
      tempo.current = null
    }
    setVisivel(false)
  }

  return (
    <span ref={ref} className="relative inline-flex" onMouseEnter={entrar} onMouseLeave={sair}>
      {children}
      {posicao !== null &&
        createPortal(
          <span
            role="tooltip"
            data-testid="tooltip-descricao"
            style={{ left: posicao.left, top: posicao.top }}
            className={cn(
              'pointer-events-none fixed z-50 w-max max-w-64 rounded-lg border bg-card px-2 py-1 text-center text-xs text-card-foreground shadow-sm transition-all duration-200 ease-out -translate-x-1/2',
              visivel ? 'translate-y-2 opacity-100' : 'translate-y-1 opacity-0',
            )}
          >
            {descricao}
          </span>,
          document.body,
        )}
    </span>
  )
}
