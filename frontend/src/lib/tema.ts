const CHAVE_TEMA = 'nit-tema'

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
