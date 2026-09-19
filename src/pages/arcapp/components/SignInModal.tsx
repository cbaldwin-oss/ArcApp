import { useState } from 'react'

type Props = {
  onClose: () => void
  onGoogle: () => Promise<{ error: string | null }>
  onEmail: (email: string) => Promise<{ error: string | null }>
}

/** Replaces the old window.prompt()-based sign-in with a real modal — Google first, magic-link
 * email as a fallback (e.g. before Google OAuth is configured in the Supabase dashboard, or for
 * anyone without a Google account). Either path is gated by arcapp_authorized_users afterward. */
export default function SignInModal({ onClose, onGoogle, onEmail }: Props) {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })
  const [busy, setBusy] = useState(false)

  async function handleGoogle() {
    setBusy(true)
    setMsg({ text: '', cls: 'q-hint' })
    const { error } = await onGoogle()
    if (error) {
      setMsg({ text: 'Google sign-in failed: ' + error, cls: 'q-hint err' })
      setBusy(false)
    }
    // On success the browser navigates away to Google — nothing else to do here.
  }

  async function handleEmail() {
    const trimmed = email.trim()
    if (!trimmed) return
    setBusy(true)
    setMsg({ text: '', cls: 'q-hint' })
    const { error } = await onEmail(trimmed)
    setBusy(false)
    setMsg(
      error
        ? { text: 'Failed: ' + error, cls: 'q-hint err' }
        : { text: `Check ${trimmed} for a sign-in link.`, cls: 'q-hint ok' },
    )
  }

  return (
    <div className="drawer-backdrop open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="signin-modal">
        <div className="signin-modal-head">
          <h3>Sign in to ArcApp</h3>
          <button className="fs-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <p className="q-hint" style={{ marginTop: 0 }}>
          Only pre-authorized emails can sign in — contact an administrator to be added.
        </p>

        <button className="seal-submit-btn" type="button" disabled={busy} onClick={handleGoogle}>
          Sign in with Google
        </button>

        <div className="signin-modal-divider">or</div>

        <div className="form-field">
          <label>Work email (magic link)</label>
          <input
            type="email"
            value={email}
            placeholder="you@company.com"
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleEmail()}
          />
        </div>
        <button className="wf-btn" style={{ width: '100%', padding: '10px 0' }} disabled={busy || !email.trim()} onClick={handleEmail}>
          Email me a sign-in link
        </button>

        <div className={msg.cls}>{msg.text}</div>
      </div>
    </div>
  )
}
