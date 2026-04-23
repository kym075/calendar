export const scheduleColors = [
  'yellow',
  'sky',
  'emerald',
  'amber',
  'rose',
  'violet',
] as const
export const scheduleTitleMaxLength = 20
export const scheduleMemoMaxLength = 120
export const recurrenceFrequencies = [
  'none',
  'daily',
  'weekly',
  'monthly',
] as const
export const recurrenceEndModes = ['never', 'onDate', 'afterCount'] as const
export const recurrenceCountMin = 1
export const recurrenceCountMax = 365

export type ScheduleColor = (typeof scheduleColors)[number]
export type ScheduleId = string
export type RecurrenceFrequency = (typeof recurrenceFrequencies)[number]
export type RecurrenceEndMode = (typeof recurrenceEndModes)[number]

export interface ScheduleRecurrence {
  frequency: RecurrenceFrequency
  endMode: RecurrenceEndMode
  untilDate: string | null
  count: number | null
}

export const defaultScheduleRecurrence: ScheduleRecurrence = {
  frequency: 'none',
  endMode: 'never',
  untilDate: null,
  count: null,
}

export interface ScheduleBase {
  title: string
  startAt: string
  endAt: string
  allDay: boolean
  memo: string
  color: ScheduleColor
  recurrence: ScheduleRecurrence
}

export interface Schedule extends ScheduleBase {
  id: ScheduleId
  createdAt: string
  updatedAt: string
}

export type ScheduleInput = ScheduleBase & {
  id?: ScheduleId
}

export interface ScheduleOccurrence extends Omit<Schedule, 'id' | 'startAt' | 'endAt'> {
  id: string
  scheduleId: ScheduleId
  startAt: string
  endAt: string
  occurrenceIndex: number
}

export function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
  return (
    typeof value === 'string' &&
    (recurrenceFrequencies as readonly string[]).includes(value)
  )
}

export function isRecurrenceEndMode(value: unknown): value is RecurrenceEndMode {
  return (
    typeof value === 'string' &&
    (recurrenceEndModes as readonly string[]).includes(value)
  )
}
