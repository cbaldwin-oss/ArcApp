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
  Settings as SettingsIcon,
} from 'lucide-react'

const NAV: Array<{ to: string; label: string; icon: typeof LayoutDashboard }> = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/todo', label: 'To-Do', icon: CheckSquare },
  { to: '/milestones', label: 'Milestones', icon: Flag },
  { to: '/schedule', label: 'Activities', icon: CalendarDays },
  { to: '/checklists', label: 'Checklists', icon: ListChecks },
  { to: '/issues', label: 'Issues', icon: AlertTriangle },
  { to: '/submittals', label: 'Submittals', icon: FileCheck2 },
  { to: '/jointpacks', label: 'Joint Packs', icon: Camera },
  { to: '/tamperseals', label: 'Tamper Seals', icon: ShieldAlert },
  { to: '/rtft', label: 'RTFT', icon: ClipboardCheck },
  { to: '/attributes', label: 'Asset Attributes', icon: Tag },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export default function Sidebar() {
  return (
    <nav className="arcapp-sidebar" aria-label="Main">
      <div className="arcapp-sidebar-nav">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
