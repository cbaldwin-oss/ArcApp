import { useEffect, useState, useCallback } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export type CurrentUser = {
  id: string
  email: string
  firstName: string
  lastName: string
}

function toCurrentUser(u: SupabaseUser | null): CurrentUser | null {
  if (!u || !u.email) return null
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  return {
    id: u.id,
    email: u.email,
    firstName: typeof meta['first_name'] === 'string' ? (meta['first_name'] as string) : '',
    lastName: typeof meta['last_name'] === 'string' ? (meta['last_name'] as string) : '',
  }
}

/**
 * Replaces Retool's platform-provided `useCurrentUser`. Retool used to inject the signed-in
 * user's session automatically; here we use Supabase Auth directly. `signInWithEmail` sends a
 * magic link (no password to manage) — swap in whatever auth flow you prefer.
 */
export function useCurrentUser(): {
  user: CurrentUser | null
  loading: boolean
  signInWithEmail: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
} {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setUser(toCurrentUser(data.session?.user ?? null))
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toCurrentUser(session?.user ?? null))
      setLoading(false)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signInWithEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email })
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return { user, loading, signInWithEmail, signOut }
}
