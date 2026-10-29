import { useState } from 'react'

interface FotoEspecieProps {
  slug: string
  imagem?: string | null
  alt: string
  className?: string
  testidFoto?: string | null
}

export function FotoEspecie({
  slug,
  imagem,
  alt,
  className,
  testidFoto = null,
}: FotoEspecieProps) {
  const [slugSemIcone, setSlugSemIcone] = useState<string | null>(null)
  const iconeQuebrado = slugSemIcone === slug

  if (imagem?.trim()) {
    return (
      <img
        {...(testidFoto ? { 'data-testid': testidFoto } : {})}
        alt={alt}
        src={`/api/especies/${slug}/imagem/`}
        className={className}
      />
    )
  }

  if (!iconeQuebrado) {
    return (
      <img
        data-testid="foto-especie-fallback"
        alt={alt}
        src={`/api/especies/${slug}/icone/`}
        onError={() => setSlugSemIcone(slug)}
        className={className}
      />
    )
  }

  return (
    <div data-testid="foto-especie-placeholder" className={className}>
      Imagem indisponível
    </div>
  )
}
