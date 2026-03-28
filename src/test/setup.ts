import '@testing-library/jest-dom'

// jsdom 29 localStorage doesn't implement clear() reliably — polyfill it
const makeLocalStorageMock = () => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value) },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (index: number): string | null => Object.keys(store)[index] ?? null,
  }
}

Object.defineProperty(window, 'localStorage', {
  value: makeLocalStorageMock(),
  writable: true,
})
