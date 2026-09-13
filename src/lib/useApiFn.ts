import { useCallback, useRef, useState } from 'react'

/**
 * Drop-in replacement for Retool's generated `useBackendFunction`. Every hook in `api.ts` wraps
 * a plain async function with this, so components that used to import from
 * `hooks/backend/rno04` keep working unchanged — same `{ data, loading, error, trigger }` shape,
 * same `trigger(params).result` promise.
 */
export function useApiFn<P, T>(fn: (params: P) => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const trigger = useCallback((params?: P) => {
    setLoading(true)
    setError(null)
    const result = fnRef
      .current(params as P)
      .then((res) => {
        setData(res)
        setLoading(false)
        return res
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        setLoading(false)
        throw err
      })
    return { result }
  }, [])

  return { data, loading, error, trigger }
}
