import type { Todo, Milestone } from './types'

/* ============ Sample data — To-Dos & Milestones ============
   Mirrors the original ArcApp dashboard's fake to-do and milestone data. */

export const TODOS: Todo[] = [
  { id: 1, text: 'Approve turnover package — Chiller Plant Room 1', tag: 'crit', tagLabel: 'Critical', sys: 'CHW-01', due: 'Due today', today: true, done: false },
  { id: 2, text: 'Review LOTO permit request — MC-204 Switchgear', tag: 'high', tagLabel: 'High', sys: 'MC-204', due: 'Due today', today: true, done: false },
  { id: 3, text: 'Walk punch list — Electrical Room 3', tag: 'norm', tagLabel: 'Normal', sys: 'ER-03', due: 'Due tomorrow', today: false, done: false },
  { id: 4, text: 'Sign off functional test — Fire Alarm Panel FP-2', tag: 'high', tagLabel: 'High', sys: 'FP-2', due: 'Due Aug 29', today: false, done: false },
  { id: 5, text: 'Update RFSU tracker — BAS Integration', tag: 'norm', tagLabel: 'Normal', sys: 'BAS-01', due: 'Due Sep 1', today: false, done: false },
  { id: 6, text: 'Coordinate vendor start-up — Generator Load Bank Test', tag: 'crit', tagLabel: 'Critical', sys: 'GEN-02', due: 'Due Sep 2', today: false, done: false },
  { id: 7, text: 'Close out punch items — Domestic Water Booster', tag: 'norm', tagLabel: 'Normal', sys: 'DWB-01', due: 'Due Aug 30', today: false, done: false },
  { id: 8, text: 'File inspection request — Emergency Lighting circuit EL-14', tag: 'norm', tagLabel: 'Normal', sys: 'EL-14', due: 'Completed Aug 26', today: false, done: true },
]

export const MILESTONES: Milestone[] = [
  { name: 'Electrical Room 3 — Energization', pct: 82, due: 'Sep 5, 2026', status: 'go', label: 'GO' },
  { name: 'Chiller Plant — Functional Testing', pct: 45, due: 'Sep 18, 2026', status: 'caution', label: 'CAUTION' },
  { name: 'Fire Alarm System — RFSU', pct: 100, due: 'Completed Aug 20', status: 'complete', label: 'COMPLETE' },
  { name: 'Emergency Generator — Load Bank Test', pct: 20, due: 'Oct 2, 2026', status: 'go', label: 'GO' },
  { name: 'Building Automation — System Integration', pct: 60, due: 'Sep 25, 2026', status: 'hold', label: 'HOLD' },
  { name: 'Domestic Water Booster — Turnover', pct: 95, due: 'Aug 30, 2026', status: 'go', label: 'GO' },
]
