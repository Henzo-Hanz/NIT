const CHAVE_DESCRICAO = 'nit-descricoes'
const EVENTO_DESCRICAO = 'nit-descricoes-alteradas'

export function descricoesAtivas(): boolean {
  try {
    return localStorage.getItem(CHAVE_DESCRICAO) !== 'desligado'
  } catch {
    return true
  }
}

export function alternarDescricoes(): boolean {
  const ativas = !descricoesAtivas()
  try {
    localStorage.setItem(CHAVE_DESCRICAO, ativas ? 'ligado' : 'desligado')
  } catch {
    // sem storage disponível: segue sem persistir
  }
  window.dispatchEvent(new Event(EVENTO_DESCRICAO))
  return ativas
}

export function escutarDescricoes(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO_DESCRICAO, aoMudar)
  return () => window.removeEventListener(EVENTO_DESCRICAO, aoMudar)
}
