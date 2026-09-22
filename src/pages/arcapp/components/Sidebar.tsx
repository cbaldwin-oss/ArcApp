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
  { to: '/netatracker', label: 'NETA Tracker', icon: FileSpreadsheet, requires: 'netaTracker' },
  { to: '/equipmenttracker', label: 'Equipment Tracker', icon: Grid3x3 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export default function Sidebar() {
  const items = NAV.filter((item) => !item.requires || hasCapability(item.requires))
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
