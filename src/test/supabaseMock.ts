import { vi } from 'vitest'

/** Creates a chainable Supabase query builder that resolves to `result`. */
export function makeQueryBuilder(result: { data: unknown; error: unknown; count?: number } = { data: [], error: null }) {
  const b: Record<string, unknown> = {}
  const chain = () => b
  b.select = vi.fn().mockReturnValue(b)
  b.insert = vi.fn().mockReturnValue(b)
  b.update = vi.fn().mockReturnValue(b)
  b.delete = vi.fn().mockReturnValue(b)
  b.eq = vi.fn().mockReturnValue(b)
  b.neq = vi.fn().mockReturnValue(b)
  b.in = vi.fn().mockReturnValue(b)
  b.gte = vi.fn().mockReturnValue(b)
  b.lte = vi.fn().mockReturnValue(b)
  b.gt = vi.fn().mockReturnValue(b)
  b.lt = vi.fn().mockReturnValue(b)
  b.order = vi.fn().mockReturnValue(b)
  b.limit = vi.fn().mockReturnValue(b)
  b.single = vi.fn().mockResolvedValue(result)
  b.maybeSingle = vi.fn().mockResolvedValue(result)
  // Make the builder thenable so `await builder` resolves to result
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  void chain
  return b
}

export function makeChannelMock() {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn(),
  }
  return channel
}

export function makeStorageMock(publicUrl = 'https://example.com/proof.jpg') {
  return {
    upload: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl } }),
  }
}
