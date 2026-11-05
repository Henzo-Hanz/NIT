import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { FotoEspecie } from '@/components/FotoEspecie'
import { cn } from '@/lib/utils'
import type { EspecieResumo } from '@/lib/api'

const INTERVALO_AUTOPLAY_MS = 3000

interface CarrosselEspecieProps {
  titulo: string
  itens: EspecieResumo[]
  onAbrir: (slug: string) => void
  testid?: string
}

export function CarrosselEspecie({ titulo, itens, onAbrir, testid }: CarrosselEspecieProps) {
  const [ativo, setAtivo] = useState(0)
  const [pausado, setPausado] = useState(false)
  const total = itens.length

  useEffect(() => {
    setAtivo((atual) => (atual < total ? atual : 0))
  }, [total])

  useEffect(() => {
    if (pausado || total < 2) {
      return undefined
    }
    const intervalo = setInterval(() => {
      setAtivo((atual) => (atual + 1) % total)
    }, INTERVALO_AUTOPLAY_MS)
    return () => {
      clearInterval(intervalo)
    }
  }, [pausado, total])

  const deslocamentoDe = (indice: number) => (indice - ativo + total) % total

  return (
    <section
      data-testid={testid}
      className="relative flex flex-col rounded-2xl bg-neutral-900 p-4 shadow-sm sm:p-5"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold uppercase tracking-[0.18em] text-neutral-100">
            {titulo}
          </h2>
          <span
            data-testid={testid ? `${testid}-contador` : 'carrossel-contador'}
            className="mt-1.5 inline-block rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold tabular-nums text-accent-foreground"
          >
            {total}
          </span>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label={`Anteriores em ${titulo}`}
            onClick={() => setAtivo((atual) => (atual - 1 + total) % total)}
            className="grid size-7 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Próximas em ${titulo}`}
            onClick={() => setAtivo((atual) => (atual + 1) % total)}
            className="grid size-7 place-items-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div
        data-testid={testid ? `${testid}-palco` : 'carrossel-palco'}
        className="relative flex h-64 items-center justify-center overflow-hidden"
      >
        {itens.map((item, indice) => {
          const deslocamento = deslocamentoDe(indice)
          const ativoAgora = deslocamento === 0
          const esquerda = deslocamento === total - 1
          const direita = deslocamento === 1
          const lateral = direita || esquerda
          const oculto = total >= 2 && !ativoAgora && !lateral
          return (
            <div
              key={item.slug}
              className={cn(
                'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-300',
                ativoAgora && 'z-20',
                lateral && 'z-10 scale-[0.8] opacity-60',
                oculto && 'z-0 scale-[0.6] opacity-0',
              )}
            >
              <button
                type="button"
                data-testid={`card-especie-${item.slug}`}
                data-ativo={ativoAgora ? 'true' : undefined}
                onClick={() => (ativoAgora ? onAbrir(item.slug) : setAtivo(indice))}
                aria-label={ativoAgora ? `Abrir ficha de ${item.nome_popular}` : undefined}
                className={cn(
                'group relative block h-64 w-48 overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all duration-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                direita && 'translate-x-[50%]',
                esquerda && '-translate-x-[50%]',
                )}
              >
                <div className="relative h-full w-full overflow-hidden bg-muted">
                  <FotoEspecie
                    slug={item.slug}
                    imagem={item.imagem}
                    alt={item.nome_popular}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                {ativoAgora && (
                  <div className="absolute bottom-3 left-3 right-3 rounded-md bg-black/55 px-3 py-2 text-left">
                    <span className="block truncate text-xs font-semibold text-white">
                      {item.nome_popular}
                    </span>
                    {item.nome_cientifico && (
                      <span className="block truncate text-[10px] italic text-white/70">
                        {item.nome_cientifico}
                      </span>
                    )}
                  </div>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
