import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { buscarPing } from './api'

const RESPOSTA_MAX_S = 60

describe('desempenho: buscarPing', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('responde dentro do teto padrão response_max_s=60', async () => {
    const inicio = performance.now()
    const resultado = await buscarPing()
    const duracao = (performance.now() - inicio) / 1000
    expect(resultado).toBe('conectado')
    expect(duracao).toBeLessThan(RESPOSTA_MAX_S)
  })
})
