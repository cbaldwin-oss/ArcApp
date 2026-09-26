import { useEffect } from 'react'
import { useGetAuthorizedUsers } from '../../../lib/api'
import type { AuthorizedUser } from '../../../lib/api'

/**
 * Fetches arcapp_authorized_users once per mount — shared by every "assign to a specific person"
 * UI (AssignPopover, TeamsManager, TodoPage's task form, Settings' DefaultAssigneePicker) so a
 * person can only ever be picked from the roster, never typed freehand. Requires the
 * authorized_users_select_all_signed_in RLS policy (any signed-in user, not just admins, can read
 * the roster) — see policies.sql; without it, a non-admin would see an empty list here.
 */
export function useAuthorizedUsersOptions() {
  const usersFn = useGetAuthorizedUsers()
  useEffect(() => {
    void usersFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return {
    users: (usersFn.data as AuthorizedUser[] | undefined) ?? [],
    loading: usersFn.loading || !usersFn.data,
    error: usersFn.error,
    retry: () => void usersFn.trigger(),
  }
}

type Props = {
  users: AuthorizedUser[]
  loadingUsers: boolean
  /** Selected email, or '' for nothing selected. */
  value: string
  onChange: (email: string) => void
  disabled?: boolean
  /** Previously-saved display name, shown alongside a stale email that's no longer on the
   * authorized list — kept visible/selectable rather than silently dropped (same pattern as
   * CxAlloyStatusPicker's stale-value handling). */
  staleName?: string | null
}

export default function PersonSelect({ users, loadingUsers, value, onChange, disabled, staleName }: Props) {
  const selectedUser = users.find((u) => u.email.toLowerCase() === value.toLowerCase())
  const stale = !!value && !selectedUser
  return (
    <select value={value} disabled={disabled || loadingUsers} onChange={(e) => onChange(e.target.value)}>
      <option value="">{loadingUsers ? 'Loading people…' : '— Select a person —'}</option>
      {users.map((u) => (
        <option key={u.id} value={u.email}>
          {u.name ? `${u.name} (${u.email})` : u.email}
        </option>
      ))}
      {stale && <option value={value}>{(staleName ? `${staleName} (${value})` : value) + ' — not in Authorized Users'}</option>}
    </select>
  )
}
