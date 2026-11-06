import { afterEach, describe, expect, it, vi } from 'vitest'
import { logDebug } from './debug'

afterEach(() => {
  localStorage.removeItem('nit:debug')
  vi.restoreAllMocks()
})

// Lapidação 11: logs do gesto das alças são puramente diagnósticos — a
// flag 'nit:debug' manda; sem ela, logDebug NÃO avaliaria nem os dados lazy.
describe('logDebug (nit:debug)', () => {
  it('é no-op sem a flag: console.log e dados lazy não são tocados', () => {
    localStorage.removeItem('nit:debug')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const dados = vi.fn(() => ({ dtms: 5 }))
    logDebug('alca', dados)
    expect(log).not.toHaveBeenCalled()
    expect(dados).not.toHaveBeenCalled()
  })

  it('com a flag ativa grava uma vez, com prefixo [nit:tag] e o objeto de dados', () => {
    localStorage.setItem('nit:debug', '1')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    logDebug('alca', () => ({ dtms: 5 }), 'mover')
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toBe('[nit:alca]')
    expect(log.mock.calls[0][1]).toEqual({ dtms: 5 })
  })

  it('tolera throw nos dados lazy: silencia em vez de quebrar o gesto', () => {
    localStorage.setItem('nit:debug', '1')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    logDebug('alca', () => {
      throw new Error('dependência instável')
    })
    expect(log).not.toHaveBeenCalled()
  })

  it('throttle por tag+chave: mesmo valor dentro de 1s não repete', () => {
    localStorage.setItem('nit:debug', '1')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    logDebug('alca', () => ({ igual: true }), 'th')
    logDebug('alca', () => ({ igual: true }), 'th')
    expect(log).toHaveBeenCalledTimes(1)
    // Valor distinto na MESMA chave passa na hora; chaves distintas não competem.
    logDebug('alca', () => ({ igual: false }), 'th')
    logDebug('render.seq', () => ({ igual: true }), 'th')
    expect(log).toHaveBeenCalledTimes(3)
    expect(log.mock.calls[2][0]).toBe('[nit:render.seq]')
  })
})
