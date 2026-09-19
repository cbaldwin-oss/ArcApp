import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useGetAuthorizedUsers, useSaveAuthorizedUser, useDeleteAuthorizedUser } from '../../../lib/api'
import type { AuthorizedUser } from '../../../lib/api'

type Props = { canEdit: boolean }

/**
 * Manages arcapp_authorized_users — the sign-in allowlist (separate from the editor list this
 * Settings page is otherwise gated by). Anyone not on this list gets signed back out immediately
 * after Google/magic-link auth succeeds — see src/lib/useCurrentUser.ts.
 */
export default function AuthorizedUsersManager({ canEdit }: Props) {
  const listFn = useGetAuthorizedUsers()
  const saveFn = useSaveAuthorizedUser()
  const deleteFn = useDeleteAuthorizedUser()

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // RLS only lets a non-editor read their OWN row (see policies.sql) — fetching this as a
  // non-editor would just come back empty, which reads as "the list is empty" rather than "you
  // can't see it," so don't even ask until canEdit is true.
  useEffect(() => {
    if (canEdit) void listFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit])

  const users = (listFn.data as AuthorizedUser[] | undefined) ?? []
  const state = !canEdit ? 'hidden' : listFn.error ? 'error' : listFn.loading || !listFn.data ? 'loading' : 'ready'

  async function addUser() {
    const trimmed = email.trim()
    if (!trimmed) {
      setFormError('An email is required.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      await saveFn.trigger({ email: trimmed, name: name.trim() }).result
      setEmail('')
      setName('')
      void listFn.trigger()
    } catch (err) {
      setFormError('Failed to add: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete(id: string) {
    setSaving(true)
    try {
      await deleteFn.trigger({ id }).result
      setDeleteId(null)
      void listFn.trigger()
    } catch {
      /* keep confirm open */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 26 }}>
      <p className="wf-subtitle">Authorized Users</p>
      <div className="q-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Only these emails can sign in to ArcApp at all (Google or magic link) — separate from who
        can edit settings/workflows. Seeded from STY4authorized_editors when this table was
        created; prune or extend it here.
      </div>

      {!canEdit && (
        <div className="q-hint">
          Sign in as an authorized editor to view or manage this list — it&apos;s not readable
          otherwise, by design.
        </div>
      )}

      {canEdit && (
        <div className="seal-row3" style={{ gridTemplateColumns: '1.3fr 1fr auto', marginBottom: 8 }}>
          <input type="email" placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="text" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <button
            className="seal-add-btn"
            style={{ width: 'auto', margin: 0, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6 }}
            disabled={saving}
            onClick={addUser}
          >
            <Plus style={{ width: 14, height: 14 }} /> Add
          </button>
        </div>
      )}
      {formError && <div className="q-hint err">{formError}</div>}

      {state === 'loading' && <div className="q-hint">Loading…</div>}
      {state === 'error' && (
        <div className="table-error" style={{ padding: '12px 0' }}>
          Couldn&apos;t load authorized users ({listFn.error}).
          <br />
          <button className="retry-btn" onClick={() => void listFn.trigger()}>
            Retry
          </button>
        </div>
      )}
      {state === 'ready' && (
        <div className="wf-order-list">
          {users.length === 0 ? (
            <div className="wf-order-empty">No authorized users yet — nobody can sign in until at least one is added.</div>
          ) : (
            users.map((u) => (
              <div className="wf-order-item" key={u.id}>
                <span className="wf-order-label">
                  {u.email}
                  {u.name ? <span className="q-hint" style={{ margin: '0 0 0 8px' }}>{u.name}</span> : null}
                </span>
                {canEdit &&
                  (deleteId === u.id ? (
                    <div className="wf-confirm">
                      Remove?
                      <button className="wf-btn danger" disabled={saving} onClick={() => confirmDelete(u.id)}>
                        {saving ? '…' : 'Yes'}
                      </button>
                      <button className="wf-btn" disabled={saving} onClick={() => setDeleteId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button className="wf-remove" title="Remove" onClick={() => setDeleteId(u.id)}>
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
