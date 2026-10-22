import { useState } from 'react'
import { Button } from '@/components/ui/button'

const CAMADAS_MOCK = [
  'Espécies litorâneas',
  'Unidades de conservação',
  'Bacias hidrográficas',
] as const

export function CamadasPanel() {
  const [ativas, setAtivas] = useState<Record<string, boolean>>({})

  const alternar = (nome: string) => {
    setAtivas((atual) => ({ ...atual, [nome]: !atual[nome] }))
  }

  return (
    <aside
      data-testid="painel-camadas"
      className="absolute right-4 top-16 z-20 w-64 rounded-xl border bg-background p-4 shadow-lg"
    >
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Camadas
      </h2>
      <ul className="flex flex-col gap-1">
        {CAMADAS_MOCK.map((camada) => (
          <li key={camada}>
            <Button
              variant="ghost"
              size="sm"
              data-testid={`camada-${camada.toLowerCase().replace(/\s+/g, '-')}`}
              aria-pressed={Boolean(ativas[camada])}
              onClick={() => alternar(camada)}
              className="w-full justify-start"
            >
              <span
                className={`mr-2 inline-block h-2 w-2 rounded-full ${ativas[camada] ? 'bg-primary' : 'bg-muted-foreground/40'}`}
              />
              {camada}
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">Exibição simulada — dados em breve.</p>
    </aside>
  )
}
