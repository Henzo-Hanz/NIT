import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SeloStatus } from '@/components/SeloStatus'
import { alternarTema, iniciarTema, temaSalvo, type Tema } from '@/lib/tema'
import { useEffect } from 'react'

const ITENS_NAV = ['Início', 'Observatório', 'Pesquisadores', 'Acesso do Gestor'] as const

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
      <div className="flex items-center gap-2">
        <span data-testid="wordmark-nit" className="text-xl font-bold tracking-tight">
          NIT
        </span>
        <span data-testid="tagline-nit" className="border-l border-primary-foreground/30 pl-2 text-xs opacity-90">
          Governo do Piauí · FAPEPI
        </span>
      </div>
      <nav data-testid="nav-nit" aria-label="Navegação principal" className="hidden gap-1 md:flex">
        {ITENS_NAV.map((item) => (
          <Button
            key={item}
            variant="ghost"
            size="sm"
            data-testid={`nav-${item.toLowerCase().replace(/\s+/g, '-')}`}
            className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
          >
            {item}
          </Button>
        ))}
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
