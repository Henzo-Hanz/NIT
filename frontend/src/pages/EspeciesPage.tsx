import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EspecieModal } from '@/components/EspecieModal'
import { buscarEspecies, type EspecieResumo } from '@/lib/api'

export function EspeciesPage() {
  const [especies, setEspecies] = useState<EspecieResumo[] | null>(null)
  const [indisponivel, setIndisponivel] = useState(false)
  const [slugAberto, setSlugAberto] = useState<string | null>(null)
  const navegar = useNavigate()

  useEffect(() => {
    let vivo = true
    buscarEspecies().then((dados) => {
      if (!vivo) {
        return
      }
      if (dados) {
        setEspecies(dados)
      } else {
        setIndisponivel(true)
      }
    })
    return () => {
      vivo = false
    }
  }, [])

  return (
    <section
      data-testid="pagina-especies"
      className="absolute inset-0 z-10 overflow-y-auto px-4 pb-10 pt-16"
    >
      <Button
        variant="ghost"
        size="sm"
        data-testid="voltar-inicio"
        className="-ml-2 mb-2 text-muted-foreground hover:text-foreground"
        onClick={() => navegar('/inicio')}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Voltar ao mapa
      </Button>
      <h1 data-testid="especies-titulo" className="mb-3 text-xl font-bold">
        Espécies do litoral do Piauí
      </h1>
      {indisponivel && (
        <p
          data-testid="especies-indisponivel"
          className="rounded-lg border bg-background p-4 text-sm text-muted-foreground"
        >
          Listagem indisponível no momento. Verifique a conexão.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(especies ?? []).map((item) => (
          <button
            key={item.slug}
            type="button"
            data-testid={`card-especie-${item.slug}`}
            onClick={() => setSlugAberto(item.slug)}
            className="rounded-xl border bg-background p-3 text-left shadow-sm transition hover:shadow-md"
          >
            <img
              alt={item.nome_popular}
              src={`/api/especies/${item.slug}/imagem/`}
              className="mx-auto mb-2.5 block h-28 w-auto rounded-lg border object-contain"
            />
            <h3 className="text-sm font-bold">{item.nome_popular}</h3>
            {item.nome_cientifico && (
              <p className="text-xs italic text-muted-foreground">{item.nome_cientifico}</p>
            )}
          </button>
        ))}
      </div>
      {slugAberto && <EspecieModal slug={slugAberto} onFechar={() => setSlugAberto(null)} />}
    </section>
  )
}
