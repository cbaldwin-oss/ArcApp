import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useGetAuthorizedUsers, useSaveAuthorizedUser, useDeleteAuthorizedUser } from '../../../lib/api'
import type { AuthorizedUser, UserRole } from '../../../lib/api'

type Props = { canEdit: boolean }

/**
 * Manages arcapp_authorized_users — ArcApp's entire access-control list: who may sign in at all,
 * AND whether they're an admin (can change Settings) or an editor (can't). `canEdit` here is
 * actually `isAdmin` from the caller (SettingsPanel.tsx) — managing this list is itself an
 * admin-only action, same reasoning as why an editor can't grant themselves adminship. Anyone not
 * on this list gets signed back out immediately after Google/magic-link auth succeeds, before ever
 * seeing the app at all — see src/lib/useCurrentUser.ts and AppShell.tsx's `!user` gate.
 */
export default function AuthorizedUsersManager({ canEdit }: Props) {
  const listFn = useGetAuthorizedUsers()
  const saveFn = useSaveAuthorizedUser()
  const deleteFn = useDeleteAuthorizedUser()

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('editor')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [roleSavingId, setRoleSavingId] = useState<string | null>(null)

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
      await saveFn.trigger({ email: trimmed, name: name.trim(), role }).result
      setEmail('')
      setName('')
      setRole('editor')
      void listFn.trigger()
    } catch (err) {
      setFormError('Failed to add: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  async function changeRole(u: AuthorizedUser, nextRole: UserRole) {
    if (nextRole === u.role) return
    setRoleSavingId(u.id)
    try {
      await saveFn.trigger({ id: u.id, email: u.email, name: u.name, role: nextRole }).result
      void listFn.trigger()
    } catch (err) {
      window.alert('Failed to change role: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setRoleSavingId(null)
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
        Only these emails can sign in to ArcApp at all (Google or magic link) — this list, and each
        person's role here, is the entire access-control model for the site now. <b style={{ color: 'var(--text)' }}>Admin</b> can
        change Settings (including this list); <b style={{ color: 'var(--text)' }}>Editor</b> can do everything else but not that.
      </div>

      {!canEdit && (
        <div className="q-hint">
          Sign in as an admin to view or manage this list — it&apos;s not readable otherwise, by
          design.
        </div>
      )}

      {canEdit && (
        <div className="seal-row3" style={{ gridTemplateColumns: '1.1fr 1fr auto auto', marginBottom: 8 }}>
          <input type="email" placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="text" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
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
                {canEdit ? (
                  <select
                    value={u.role}
                    disabled={roleSavingId === u.id}
                    onChange={(e) => void changeRole(u, e.target.value as UserRole)}
                    style={{ marginRight: 8 }}
                  >
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <span className="tag norm" style={{ marginRight: 8 }}>
                    {u.role === 'admin' ? 'Admin' : 'Editor'}
                  </span>
                )}
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
