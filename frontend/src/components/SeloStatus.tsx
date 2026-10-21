import { useEffect, useState } from 'react'
import { buscarPing, type SeloStatus } from '@/lib/api'

type Estado = 'carregando' | SeloStatus

export function SeloStatus() {
  const [estado, setEstado] = useState<Estado>('carregando')

  useEffect(() => {
    let ativo = true
    buscarPing().then((selo) => {
      if (ativo) {
        setEstado(selo)
      }
    })
    return () => {
      ativo = false
    }
  }, [])

  return (
    <span
      data-testid="selo-status"
      data-status={estado}
      className={
        estado === 'conectado'
          ? 'text-emerald-600 font-bold'
          : estado === 'indisponível'
            ? 'text-red-600 font-bold'
            : 'text-gray-500'
      }
    >
      {estado === 'carregando' ? 'carregando…' : estado}
    </span>
  )
}
