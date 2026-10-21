import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { SeloStatus } from './SeloStatus'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CA-5: selo indisponível quando a chamada falha, sem quebrar', () => {
  it('exibe "indisponível" quando a rede falha', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network down'))
    render(<SeloStatus />)
    await waitFor(() => {
      const selo = screen.getByTestId('selo-status')
      expect(selo).toHaveTextContent('indisponível')
      expect(selo.getAttribute('data-status')).toBe('indisponível')
    })
  })

  it('exibe "indisponível" quando a resposta não é 2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ erro: 'x' }), { status: 500 }),
    )
    render(<SeloStatus />)
    await waitFor(() => {
      expect(screen.getByTestId('selo-status')).toHaveTextContent('indisponível')
    })
  })
})
