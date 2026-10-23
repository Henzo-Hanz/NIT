import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
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
        >
          <div className="flex items-start justify-between gap-4">
            <h2 data-testid="nome-popular-modal" className="text-xl font-bold text-foreground">
              {ficha ? ficha.nome_popular : 'Carregando…'}
            </h2>
            <Button
              variant="ghost"
              size="icon-sm"
              data-testid="fechar-especie"
              aria-label="Fechar ficha"
              onClick={onFechar}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div aria-live="polite">
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
                <div className="overflow-hidden rounded-2xl border bg-accent">
                  <img
                    data-testid="foto-especie"
                    alt={ficha.nome_popular}
                    src={`/api/especies/${slug}/imagem/`}
                    className="mx-auto block max-h-64 w-full object-contain"
                  />
                </div>
                {ficha.nome_cientifico && (
                  <p
                    data-testid="nome-cientifico"
                    className="mt-3 inline-flex rounded-full bg-muted px-3 py-1 text-xs italic text-muted-foreground"
                  >
                    {ficha.nome_cientifico}
                  </p>
                )}
                <p
                  data-testid="descricao-especie"
                  className="mt-3 text-sm leading-relaxed text-foreground"
                >
                  {ficha.descricao}
                </p>
                <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                  {Object.entries(ficha.infos ?? {}).map(([chave, valor]) => (
                    <div
                      key={chave}
                      data-testid="info-especie"
                      className="rounded-xl border bg-card p-3"
                    >
                      <dt className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        {chave.replace(/_/g, ' ')}
                      </dt>
                      <dd className="mt-0.5 text-sm">{String(valor)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-5 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="voltar-mapa"
                    onClick={onFechar}
                  >
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
