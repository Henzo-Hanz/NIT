const CHAVE_TEMA = 'nit-tema'
const EVENTO_TEMA = 'nit-tema-alterado'

export type Tema = 'claro' | 'escuro'

export function temaSalvo(): Tema {
  try {
    return localStorage.getItem(CHAVE_TEMA) === 'escuro' ? 'escuro' : 'claro'
  } catch {
    return 'claro'
  }
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.classList.toggle('dark', tema === 'escuro')
  window.dispatchEvent(new Event(EVENTO_TEMA))
}

export function escutarTema(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO_TEMA, aoMudar)
  return () => window.removeEventListener(EVENTO_TEMA, aoMudar)
}

export function alternarTema(temaAtual: Tema): Tema {
  const novo: Tema = temaAtual === 'claro' ? 'escuro' : 'claro'
  aplicarTema(novo)
  try {
    localStorage.setItem(CHAVE_TEMA, novo === 'escuro' ? 'escuro' : 'claro')
  } catch {
    return novo
  }
  return novo
}

export function iniciarTema(): void {
  aplicarTema(temaSalvo())
}
