import { useEffect, useState, useCallback, useRef } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

export type CurrentUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  /** Display name — from arcapp_authorized_users if an admin set one, else Google's profile name, else the email. */
  name: string
}

function toRawUser(u: SupabaseUser | null): { id: string; email: string; firstName: string; lastName: string; googleName: string } | null {
  if (!u || !u.email) return null
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const googleName = typeof meta['full_name'] === 'string' ? (meta['full_name'] as string) : typeof meta['name'] === 'string' ? (meta['name'] as string) : ''
  return {
    id: u.id,
    email: u.email,
    firstName: typeof meta['first_name'] === 'string' ? (meta['first_name'] as string) : '',
    lastName: typeof meta['last_name'] === 'string' ? (meta['last_name'] as string) : '',
    googleName,
  }
}

/**
 * Replaces Retool's platform-provided `useCurrentUser`. Retool used to inject the signed-in
 * user's session automatically; here we use Supabase Auth directly.
 *
 * Sign-in is gated: after ANY successful auth (Google or the magic-link fallback), this checks
 * the signed-in email against `arcapp_authorized_users` and immediately signs back out anyone
 * not on that list, surfacing why via `authError`. See supabase/schema.sql for that table and
 * supabase/policies.sql for why its RLS only lets you read your own row.
 */
export function useCurrentUser(): {
  user: CurrentUser | null
  loading: boolean
  /** Set when a sign-in succeeded at the Supabase Auth level but the email isn't authorized — cleared on the next sign-in attempt or sign-out. */
  authError: string | null
  signInWithGoogle: () => Promise<{ error: string | null }>
  signInWithEmail: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  clearAuthError: () => void
} {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  // Guards against the SIGNED_OUT event we trigger ourselves (below) re-entering this same check.
  const checking = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function applySession(rawUser: SupabaseUser | null) {
      const base = toRawUser(rawUser)
      if (!base) {
        if (!cancelled) setUser(null)
        if (!cancelled) setLoading(false)
        return
      }
      if (checking.current) return
      checking.current = true
      try {
        const email = base.email.toLowerCase().trim()
        const res = await supabase.from('arcapp_authorized_users').select('name').ilike('email', email).limit(1).maybeSingle()
        if (cancelled) return
        if (res.error) throw new Error(res.error.message)
        if (!res.data) {
          setAuthError(`${base.email} isn't authorized for ArcApp yet. Contact an administrator to be added.`)
          setUser(null)
          setLoading(false)
          await supabase.auth.signOut()
          return
        }
        const authorizedName = (res.data as { name: string | null }).name
        setAuthError(null)
        setUser({
          id: base.id,
          email: base.email,
          firstName: base.firstName,
          lastName: base.lastName,
          name: authorizedName || base.googleName || `${base.firstName} ${base.lastName}`.trim() || base.email,
        })
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setAuthError('Could not verify authorization: ' + (err instanceof Error ? err.message : String(err)))
        setUser(null)
        setLoading(false)
      } finally {
        checking.current = false
      }
    }

    supabase.auth.getSession().then(({ data }) => void applySession(data.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session?.user ?? null)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    return { error: error?.message ?? null }
  }, [])

  const signInWithEmail = useCallback(async (email: string) => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithOtp({ email })
    return { error: error?.message ?? null }
  }, [])

  const signOut = useCallback(async () => {
    setAuthError(null)
    await supabase.auth.signOut()
  }, [])

  const clearAuthError = useCallback(() => setAuthError(null), [])

  return { user, loading, authError, signInWithGoogle, signInWithEmail, signOut, clearAuthError }
}
