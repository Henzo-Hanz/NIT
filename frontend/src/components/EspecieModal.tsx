import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
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

  useEffect(() => {
    const aoTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        onFechar()
      }
    }
    document.addEventListener('keydown', aoTeclear)
    return () => document.removeEventListener('keydown', aoTeclear)
  }, [onFechar])

  return (
    <div
      data-testid="modal-especie"
      role="dialog"
      aria-modal="true"
      aria-label="Ficha da espécie"
      className="absolute inset-0 z-40 flex items-center justify-center p-4"
    >
      <button
        type="button"
        data-testid="modal-fundo"
        aria-label="Fechar ficha"
        onClick={onFechar}
        className="absolute inset-0 bg-foreground/40"
      />
      <div className="relative z-10 max-h-[80vh] w-[min(92vw,520px)] overflow-y-auto rounded-2xl border bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 data-testid="nome-popular-modal" className="text-xl font-bold">{ficha ? ficha.nome_popular : 'Carregando…'}</h2>
          <Button
            variant="ghost"
            size="sm"
            data-testid="fechar-especie"
            aria-label="Fechar ficha"
            onClick={onFechar}
          >
            ✕
          </Button>
        </div>
        {indisponivel && (
          <p
            data-testid="modal-indisponivel"
            className="py-8 text-center text-sm text-muted-foreground"
          >
            Ficha indisponível no momento. Verifique a conexão.
          </p>
        )}
        {ficha && (
          <>
            <img
              data-testid="foto-especie"
              alt={ficha.nome_popular}
              src={`/api/especies/${slug}/imagem/`}
              className="mx-auto my-4 h-44 w-auto rounded-2xl border bg-accent object-contain p-2"
            />
            {ficha.nome_cientifico && (
              <p
                data-testid="nome-cientifico"
                className="mb-2 text-center text-sm italic text-muted-foreground"
              >
                {ficha.nome_cientifico}
              </p>
            )}
            <p data-testid="descricao-especie" className="text-sm leading-relaxed">
              {ficha.descricao}
            </p>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2">
              {Object.entries(ficha.infos ?? {}).map(([chave, valor]) => (
                <div key={chave} data-testid="info-especie" className="rounded-lg border p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {chave.replace(/_/g, ' ')}
                  </dt>
                  <dd className="mt-0.5 text-sm">{String(valor)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex justify-end">
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
    </div>
  )
}
