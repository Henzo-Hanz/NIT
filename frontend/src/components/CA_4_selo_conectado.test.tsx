import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { SeloStatus } from './SeloStatus'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CA-4: selo conectado quando o backend responde ok', () => {
  it('exibe "conectado" após resposta 200 {"status": "ok"}', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
    )
    render(<SeloStatus />)
    await waitFor(() => {
      const selo = screen.getByTestId('selo-status')
      expect(selo).toHaveTextContent('conectado')
      expect(selo.getAttribute('data-status')).toBe('conectado')
    })
  })
})
