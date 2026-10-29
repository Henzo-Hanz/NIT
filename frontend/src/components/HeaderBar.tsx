import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { SeloStatus } from '@/components/SeloStatus'
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

  useEffect(() => {
    iniciarTema()
    setTema(temaSalvo())
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
      <nav data-testid="nav-nit" aria-label="Navegação principal" className="hidden gap-1 md:flex">
        {ITENS_NAV.map((item) => {
          const testid = `nav-${item.rotulo.toLowerCase().replace(/\s+/g, '-')}`
          if (item.caminho) {
            return (
              <Link
                key={item.rotulo}
                to={item.caminho}
                data-testid={testid}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
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
        <Button
          variant="outline"
          size="sm"
          data-testid="toggle-tema"
          aria-label="Alternar tema claro/escuro"
          onClick={() => setTema(alternarTema(tema))}
        >
          {tema === 'claro' ? '☾' : '☀'}
        </Button>
      </div>
    </header>
  )
}
