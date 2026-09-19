import type { Milestone } from './types'

/* ============ Sample data — Milestones ============
   Mirrors the original ArcApp dashboard's fake milestone data. To-Dos used to live here too but
   are now real, persisted tasks (arcapp_tasks) — see src/lib/api.ts (useGetTasks etc.). */

export const MILESTONES: Milestone[] = [
  { name: 'Electrical Room 3 — Energization', pct: 82, due: 'Sep 5, 2026', status: 'go', label: 'GO' },
  { name: 'Chiller Plant — Functional Testing', pct: 45, due: 'Sep 18, 2026', status: 'caution', label: 'CAUTION' },
  { name: 'Fire Alarm System — RFSU', pct: 100, due: 'Completed Aug 20', status: 'complete', label: 'COMPLETE' },
  { name: 'Emergency Generator — Load Bank Test', pct: 20, due: 'Oct 2, 2026', status: 'go', label: 'GO' },
  { name: 'Building Automation — System Integration', pct: 60, due: 'Sep 25, 2026', status: 'hold', label: 'HOLD' },
  { name: 'Domestic Water Booster — Turnover', pct: 95, due: 'Aug 30, 2026', status: 'go', label: 'GO' },
]
