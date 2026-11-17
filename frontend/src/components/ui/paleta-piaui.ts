// Paleta institucional (logo do Governo do Piauí): azul, amarelo, vermelho e
// verde — SEMPRE nessa ordem. O carrossel N escolhe `indice % 4`, então uma
// sequência de painéis pinta azul, amarelo, vermelho, verde e recomeça no
// azul. No tema escuro, tons mais escuros das MESMAS cores (sem texto morto).
export interface CorPaleta {
  fundo: string
  titulo: string
  chip: string
  setas: string
}

export const PALETA_PIAUI: CorPaleta[] = [
  {
    fundo: 'bg-[#1878BE] dark:bg-[#0E4D7C]',
    titulo: 'text-white dark:text-[#CBE6F8]',
    chip: 'bg-white/15 text-white dark:bg-white/10 dark:text-[#CBE6F8]',
    setas:
      'border border-white/30 bg-white/20 text-white hover:bg-white/30 dark:border-white/20 dark:bg-white/10 dark:text-[#CBE6F8] dark:hover:bg-white/20',
  },
  {
    fundo: 'bg-[#F5B31E] dark:bg-[#7A5E12]',
    titulo: 'text-[#3F2D00] dark:text-[#F6E4B5]',
    chip: 'bg-black/10 text-[#3F2D00] dark:bg-white/10 dark:text-[#F6E4B5]',
    setas:
      'border border-black/20 bg-black/10 text-[#3F2D00] hover:bg-black/20 dark:border-white/20 dark:bg-white/10 dark:text-[#F6E4B5] dark:hover:bg-white/20',
  },
  {
    fundo: 'bg-[#DB3B25] dark:bg-[#7C2214]',
    titulo: 'text-white dark:text-[#F5CFC7]',
    chip: 'bg-white/15 text-white dark:bg-white/10 dark:text-[#F5CFC7]',
    setas:
      'border border-white/30 bg-white/20 text-white hover:bg-white/30 dark:border-white/20 dark:bg-white/10 dark:text-[#F5CFC7] dark:hover:bg-white/20',
  },
  {
    fundo: 'bg-[#2E9E4F] dark:bg-[#1C5B33]',
    titulo: 'text-white dark:text-[#CFEAD8]',
    chip: 'bg-white/15 text-white dark:bg-white/10 dark:text-[#CFEAD8]',
    setas:
      'border border-white/30 bg-white/20 text-white hover:bg-white/30 dark:border-white/20 dark:bg-white/10 dark:text-[#CFEAD8] dark:hover:bg-white/20',
  },
]

export const corDaPaleta = (indice: number): CorPaleta =>
  PALETA_PIAUI[((indice % PALETA_PIAUI.length) + PALETA_PIAUI.length) % PALETA_PIAUI.length]
