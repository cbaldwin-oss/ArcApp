import { createClient } from '@supabase/supabase-js'

const url = import.meta.env['VITE_SUPABASE_URL']
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY']

/**
 * True only when both env vars are present and the URL actually parses. `createClient` throws
 * synchronously on an empty/invalid URL, and since this module is imported (transitively) by
 * almost every component, that exception used to happen before React ever rendered anything —
 * a blank white screen with the real error buried in the browser console. We check first and
 * fall back to a harmless placeholder URL so the module always loads; `App.tsx` checks this flag
 * and shows a visible "needs setup" screen instead of silently failing.
 */
export const isSupabaseConfigured = Boolean(url && anonKey && isValidUrl(url))

function isValidUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export const supabase = createClient(isSupabaseConfigured ? url : 'https://placeholder.supabase.co', isSupabaseConfigured ? anonKey : 'placeholder-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.error(
    'Missing or invalid VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env, ' +
      'fill in real values from your Supabase project settings, then restart `npm run dev` ' +
      '(Vite only reads .env on startup, not on hot-reload).',
  )
}
