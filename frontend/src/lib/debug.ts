// [nit:debug] — logs de diagnóstico do gesto das alças (SPEC-0005, lapidação 11).
// A RAIZ do atraso das alças ainda não é compreendida: o dono ativa, interage
// e reporta os logs (imperativo vs render, dtms por evento).
//
// Como ativar: localStorage.setItem('nit:debug', '1') e recarregar a página.
// NENHUM teste depende destes logs — sem a flag, logDebug é no-op completo.
//
// Formato: prefixo `[nit:${tag}]` + objeto de dados. `dados` é LAZY (função):
// só avaliado com a flag ativa, com tolerância a throw nas dependências.
// Throttle por tag+chave: mesmo valor serializado → pula (exceto 1 "batida"/s);
// valor novo passa, no máximo 1 log/s por chave.
const BATIDA_MS = 1000

type Batida = { valor: string; momento: number }
const batidas = new Map<string, Batida>()

export function logDebug(
  tag: string,
  dados: () => Record<string, unknown>,
  chave = 'geral',
): void {
  if (localStorage.getItem('nit:debug') !== '1') {
    return
  }
  let serializado: string
  try {
    serializado = JSON.stringify(dados())
  } catch {
    return
  }
  const agora = Date.now()
  const identidade = `${tag}:${chave}`
  const ultima = batidas.get(identidade)
  if (ultima && ultima.valor === serializado && agora - ultima.momento < BATIDA_MS) {
    return
  }
  batidas.set(identidade, { valor: serializado, momento: agora })
  console.log(`[nit:${tag}]`, JSON.parse(serializado))
}
