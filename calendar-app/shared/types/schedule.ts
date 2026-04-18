export const scheduleColors = [
  'slate',
  'sky',
  'emerald',
  'amber',
  'rose',
  'violet',
] as const
export const scheduleTitleMaxLength = 20
export const scheduleMemoMaxLength = 120

export type ScheduleColor = (typeof scheduleColors)[number]
export type ScheduleId = string

export interface ScheduleBase {
  title: string
  startAt: string
  endAt: string
  allDay: boolean
  memo: string
  color: ScheduleColor
}

export interface Schedule extends ScheduleBase {
  id: ScheduleId
  createdAt: string
  updatedAt: string
}

export type ScheduleInput = ScheduleBase & {
  id?: ScheduleId
}
