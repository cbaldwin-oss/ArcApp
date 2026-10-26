import { useState } from 'react'
import { ChevronDown, ChevronRight, Settings as SettingsIcon } from 'lucide-react'

/**
 * Collapsed-by-default "Settings" drawer embedded at the top of a module's own page (Checklists,
 * Issues, Joint Packs, NETA Tracker, Submittals) — added 2026-10-26 when most per-module settings
 * moved out of the single Settings tab into the module they actually configure, leaving only
 * cross-cutting/app-wide things (CxAlloy project override, each module's own enable/disable
 * toggle, Workflows, Authorized Users) there. Same collapse-by-default pattern TeamsManager's
 * "Manage" button already uses, so this reads as the same kind of control everywhere it appears.
 * Visible to everyone (an editor can see what's configured), same "Only admins can change
 * settings." messaging on each control inside as the old Settings tab had — this wrapper itself
 * doesn't gate anything, the Field/ToggleField/etc. controls inside already do via their own
 * `canEdit` prop.
 */
type Props = {
  children: React.ReactNode
  /** Controlled open state, for a page that needs to jump straight to its own Settings section
   * (e.g. Joint Packs' "no destination folder set" notice expanding it instead of navigating
   * away) — omit to just manage its own collapsed-by-default state, the common case. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export default function ModuleSettingsSection({ children, open: openProp, onOpenChange }: Props) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = onOpenChange ?? setOpenState
  return (
    <div className="wf-form" style={{ marginBottom: 18 }}>
      <button
        type="button"
        className="wf-btn"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <SettingsIcon style={{ width: 13, height: 13 }} />
        Settings
        {open ? <ChevronDown style={{ width: 13, height: 13 }} /> : <ChevronRight style={{ width: 13, height: 13 }} />}
      </button>
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  )
}
