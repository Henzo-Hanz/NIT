import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TooltipDescricao } from '@/components/ui/tooltip'
import { SeloStatus } from '@/components/SeloStatus'
import { alternarDescricoes, descricoesAtivas } from '@/lib/descricoes'
import { alternarTema, iniciarTema, temaSalvo, type Tema } from '@/lib/tema'

type ItemNav = { rotulo: string; caminho?: string }

const ITENS_NAV: ItemNav[] = [
  { rotulo: 'Início', caminho: '/inicio' },
  { rotulo: 'Espécies', caminho: '/especies' },
  { rotulo: 'Pesquisadores' },
  { rotulo: 'Acesso do Gestor' },
]

export function HeaderBar() {
  const [tema, setTema] = useState<Tema>('claro')
  const [descricoes, setDescricoes] = useState(true)

  useEffect(() => {
    iniciarTema()
    setTema(temaSalvo())
    setDescricoes(descricoesAtivas())
  }, [])

  return (
    <header
      data-testid="header-nit"
      className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 bg-primary px-4 py-2 text-primary-foreground shadow"
    >
      <div className="flex items-center gap-3">
        <span data-testid="wordmark-nit" className="text-xl font-bold tracking-tight">
          NIT
        </span>
        <img
          data-testid="logo-institucional"
          src="/images/logos/logo_unificada.png"
          alt="FAPEPI e Governo do Estado do Piauí"
          className="h-9 w-auto rounded-md"
        />
      </div>
      <nav data-testid="nav-nit" aria-label="Navegação principal" className="hidden flex-nowrap items-center gap-1 md:flex">
        {ITENS_NAV.map((item) => {
          const testid = `nav-${item.rotulo.toLowerCase().replace(/\s+/g, '-')}`
          if (item.caminho) {
            return (
              <Link
                key={item.rotulo}
                to={item.caminho}
                data-testid={testid}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              >
                {item.rotulo}
              </Link>
            )
          }
          return (
            <Button
              key={item.rotulo}
              variant="ghost"
              size="sm"
              data-testid={testid}
              className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
            >
              {item.rotulo}
            </Button>
          )
        })}
      </nav>
      <div className="flex items-center gap-3">
        <SeloStatus />
        <TooltipDescricao
          sempreVisivel
          descricao="Liga ou desliga as descrições das ferramentas e menus"
        >
          <Button
            variant="outline"
            size="sm"
            data-testid="toggle-descricoes"
            data-ativo={descricoes ? 'true' : 'false'}
            aria-label={
              descricoes
                ? 'Desativar descrições das ferramentas e menus (ligadas)'
                : 'Ativar descrições das ferramentas e menus (desligadas)'
            }
            aria-pressed={descricoes}
            onClick={() => setDescricoes(alternarDescricoes())}
            className={
              descricoes
                ? 'border bg-background text-foreground shadow-sm hover:bg-muted'
                : 'border bg-muted text-muted-foreground shadow-sm hover:bg-muted/80'
            }
          >
            {descricoes ? (
              <>
                <Eye className="size-4" aria-hidden="true" />
                <span className="text-xs font-medium">Dicas</span>
              </>
            ) : (
              <>
                <EyeOff className="size-4" aria-hidden="true" />
                <span className="text-xs font-medium line-through">Dicas</span>
              </>
            )}
          </Button>
        </TooltipDescricao>
        <Button
          variant="outline"
          size="sm"
          data-testid="toggle-tema"
          aria-label="Alternar tema claro/escuro"
          onClick={() => setTema(alternarTema(tema))}
          className="border bg-background text-foreground shadow-sm hover:bg-muted"
        >
          {tema === 'claro' ? '☾' : '☀'}
        </Button>
      </div>
    </header>
  )
}
