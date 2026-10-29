import { useEffect, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FotoEspecie } from '@/components/FotoEspecie'
import { buscarEspecie, type EspecieDetalhe } from '@/lib/api'

interface EspecieModalProps {
  slug: string
  onFechar: () => void
  onVoltarLista?: () => void
}

export function EspecieModal({ slug, onFechar, onVoltarLista }: EspecieModalProps) {
  const [ficha, setFicha] = useState<EspecieDetalhe | null>(null)
  const [indisponivel, setIndisponivel] = useState(false)
  const entradasInfos = ficha ? Object.entries(ficha.infos ?? {}) : []

  useEffect(() => {
    let vivo = true
    setFicha(null)
    setIndisponivel(false)
    buscarEspecie(slug).then((dados) => {
      if (!vivo) {
        return
      }
      if (dados) {
        setFicha(dados)
      } else {
        setIndisponivel(true)
      }
    })
    return () => {
      vivo = false
    }
  }, [slug])

  return (
    <Dialog.Root
      open
      onOpenChange={(aberto) => {
        if (!aberto) {
          onFechar()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop data-testid="modal-fundo" onClick={onFechar} />
        <Dialog.Popup
          data-testid="modal-especie"
          aria-label="Ficha da espécie"
          className="no-scrollbar"
        >
          <div className="flex shrink-0 items-center gap-2 bg-primary px-6 py-3.5 text-primary-foreground">
            {onVoltarLista && (
              <Button
                variant="ghost"
                size="icon-sm"
                data-testid="voltar-lista"
                aria-label="Voltar para a lista de caranguejos"
                onClick={onVoltarLista}
                className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <h2 data-testid="nome-popular-modal" className="min-w-0 flex-1 truncate text-lg font-bold">
              {ficha ? ficha.nome_popular : 'Carregando…'}
            </h2>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="fechar-especie"
              aria-label="Fechar ficha"
              onClick={onFechar}
              className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div
            className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6 no-scrollbar"
            aria-live="polite"
          >
            {indisponivel && (
              <p
                data-testid="modal-indisponivel"
                className="py-10 text-center text-sm text-muted-foreground"
              >
                Ficha indisponível no momento. Verifique a conexão.
              </p>
            )}
            {ficha && (
              <>
                <FotoEspecie
                  slug={slug}
                  imagem={ficha.imagem}
                  alt={ficha.nome_popular}
                  testidFoto="foto-especie"
                  className="mx-auto block max-h-64 max-w-full self-center rounded-2xl border border-border bg-accent ring-2 ring-primary/20"
                />
                {ficha.nome_cientifico && (
                  <p
                    data-testid="nome-cientifico"
                    className="inline-flex items-center self-start rounded-full bg-primary/10 px-3.5 py-1.5 text-xs italic text-primary"
                  >
                    <span className="mr-1 not-italic font-semibold tracking-wide">Nome Científico:</span>
                    {ficha.nome_cientifico}
                  </p>
                )}
                <p
                  data-testid="descricao-especie"
                  className="text-sm leading-relaxed text-foreground"
                >
                  {ficha.descricao}
                </p>
                <dl
                  className={`grid gap-3 ${entradasInfos.length > 1 ? 'sm:grid-cols-2' : ''}`}
                >
                  {entradasInfos.map(([chave, valor], indice) => {
                    const ultimoSolitario =
                      indice === entradasInfos.length - 1 && entradasInfos.length > 1 && entradasInfos.length % 2 === 1
                    return (
                      <div
                        key={chave}
                        data-testid="info-especie"
                        className={cn(
                          'rounded-xl border border-primary/15 bg-accent/40 p-3.5 transition-shadow hover:shadow-md',
                          ultimoSolitario && 'sm:col-span-2',
                        )}
                      >
                        <dt className="text-[0.7rem] font-semibold uppercase tracking-wide text-primary/80">
                          {chave.replace(/_/g, ' ')}
                        </dt>
                        <dd className="mt-1 text-sm">{String(valor)}</dd>
                      </div>
                    )
                  })}
                </dl>
                <div className="flex justify-center">
                  <Button
                    variant="default"
                    size="sm"
                    data-testid="voltar-mapa"
                    onClick={onFechar}
                  >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Voltar ao mapa
                  </Button>
                </div>
              </>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
