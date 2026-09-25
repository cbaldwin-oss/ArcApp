import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  CheckSquare,
  Flag,
  CalendarDays,
  ListChecks,
  AlertTriangle,
  FileCheck2,
  Camera,
  ShieldAlert,
  ClipboardCheck,
  Tag,
  Grid3x3,
  FileSpreadsheet,
  Settings as SettingsIcon,
} from 'lucide-react'
import { hasCapability, type Capability } from '../../../lib/project'

const NAV: Array<{ to: string; label: string; icon: typeof LayoutDashboard; requires?: Capability }> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/todo', label: 'To-Do', icon: CheckSquare },
  { to: '/milestones', label: 'Milestones', icon: Flag },
  { to: '/schedule', label: 'Activities', icon: CalendarDays },
  { to: '/checklists', label: 'Checklists', icon: ListChecks, requires: 'cxAlloyActions' },
  { to: '/issues', label: 'Issues', icon: AlertTriangle, requires: 'cxAlloyActions' },
  { to: '/submittals', label: 'Submittals', icon: FileCheck2 },
  { to: '/jointpacks', label: 'Joint Packs', icon: Camera },
  { to: '/tamperseals', label: 'Tamper Seals', icon: ShieldAlert, requires: 'siteLogging' },
  { to: '/rtft', label: 'RTFT', icon: ClipboardCheck, requires: 'siteLogging' },
  { to: '/attributes', label: 'Asset Attributes', icon: Tag, requires: 'cxAlloyActions' },
  { to: '/equipmenttracker', label: 'Equipment Tracker', icon: Grid3x3 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

/** NETA Tracker isn't in the static NAV list above — unlike the other gated items, its
 * availability is a per-project Settings toggle (`netaTrackerEnabled`), not a project.ts
 * capability, so it's spliced in conditionally instead of filtered via `requires`. */
const NETA_NAV_ITEM = { to: '/netatracker', label: 'NETA Tracker', icon: FileSpreadsheet }

export default function Sidebar({ netaTrackerEnabled }: { netaTrackerEnabled: boolean }) {
  const items = NAV.filter((item) => !item.requires || hasCapability(item.requires))
  // Slotted after "Attributes" / before "Equipment Tracker", matching where it used to sit in NAV.
  const equipmentTrackerIdx = items.findIndex((i) => i.to === '/equipmenttracker')
  if (netaTrackerEnabled) items.splice(equipmentTrackerIdx, 0, NETA_NAV_ITEM)
  return (
    <nav className="arcapp-sidebar" aria-label="Main">
      <div className="arcapp-sidebar-nav">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
