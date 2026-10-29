import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { buscarPing } from './api'

describe('CA-3: client de API usa caminho relativo /api', () => {
  let chamadas: string[]

  beforeEach(() => {
    chamadas = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      chamadas.push(typeof input === 'string' ? input : input.url)
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('busca /api/ping/ com caminho relativo, sem origem absoluta', async () => {
    const resultado = await buscarPing()
    expect(resultado).toBe('conectado')
    expect(chamadas.length).toBe(1)
    expect(chamadas[0]).toBe('/api/ping/')
    expect(chamadas[0].startsWith('/')).toBe(true)
    expect(chamadas[0].includes('://')).toBe(false)
  })
})
