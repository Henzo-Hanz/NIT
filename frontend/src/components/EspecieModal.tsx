import { useEffect, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { buscarEspecie, type EspecieDetalhe } from '@/lib/api'

interface EspecieModalProps {
  slug: string
  onFechar: () => void
}

export function EspecieModal({ slug, onFechar }: EspecieModalProps) {
  const [ficha, setFicha] = useState<EspecieDetalhe | null>(null)
  const [indisponivel, setIndisponivel] = useState(false)

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
          <div className="flex shrink-0 items-center justify-between gap-3 bg-primary px-6 py-3.5 text-primary-foreground">
            <h2 data-testid="nome-popular-modal" className="truncate text-lg font-bold">
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
          <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar p-6" aria-live="polite">
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
                <div className="mx-auto w-fit overflow-hidden rounded-2xl border border-border bg-accent ring-2 ring-primary/20">
                  <img
                    data-testid="foto-especie"
                    alt={ficha.nome_popular}
                    src={`/api/especies/${slug}/imagem/`}
                    className="block max-h-64 object-contain"
                  />
                </div>
                {ficha.nome_cientifico && (
                  <p
                    data-testid="nome-cientifico"
                    className="mt-4 inline-flex rounded-full bg-primary/10 px-3.5 py-1.5 text-xs italic text-primary"
                  >
                    <span className="mr-1 not-italic font-semibold tracking-wide">Nome Científico:</span>
                    {ficha.nome_cientifico}
                  </p>
                )}
                <p
                  data-testid="descricao-especie"
                  className="mt-4 text-sm leading-relaxed text-foreground"
                >
                  {ficha.descricao}
                </p>
                <dl
                  className={`mt-6 grid gap-3 ${Object.entries(ficha.infos ?? {}).length > 1 ? 'sm:grid-cols-2' : ''}`}
                >
                  {Object.entries(ficha.infos ?? {}).map(([chave, valor]) => (
                    <div
                      key={chave}
                      data-testid="info-especie"
                      className="rounded-xl border border-primary/15 bg-accent/40 p-3.5 transition-shadow hover:shadow-md"
                    >
                      <dt className="text-[0.7rem] font-semibold uppercase tracking-wide text-primary/80">
                        {chave.replace(/_/g, ' ')}
                      </dt>
                      <dd className="mt-1 text-sm">{String(valor)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-6 flex justify-center">
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
