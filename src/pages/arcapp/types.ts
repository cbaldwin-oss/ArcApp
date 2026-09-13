export type ScheduleRow = {
  id: string | number
  date: string
  time: string
  place: string
  activity: string
  asset: string
  trade: string
  status: string
  loto: boolean
  result: string
}

export type Todo = {
  id: number
  text: string
  tag: 'crit' | 'high' | 'norm'
  tagLabel: string
  sys: string
  due: string
  today: boolean
  done: boolean
}

export type Milestone = {
  name: string
  pct: number
  due: string
  status: 'go' | 'caution' | 'hold' | 'complete'
  label: string
}

export type ActivityAnswer = {
  offsetHrs: number
  caCount: number
  launchpadStatus?: string
  launchpadNotes?: string
  cmmsEquipmentId?: string
  cmmsWorkOrder?: string
  cmmsNotes?: string
}

export type ScheduleState = 'loading' | 'ready' | 'error'

export type SealSummary = {
  text: string
  time: string
}
