export const scheduleColors = [
  'sky',
  'rose',
  'emerald',
  'violet',
  'amber',
  'yellow',
] as const

// 入力欄と保存前チェックで共通利用する制限値。
export const scheduleTitleMaxLength = 20
export const scheduleMemoMaxLength = 120

// 繰り返し予定で選べる値。as const により文字列の候補を型として扱える。
export const recurrenceFrequencies = [
  'none',
  'daily',
  'weekly',
  'monthly',
] as const
export const recurrenceEndModes = ['never', 'onDate', 'afterCount'] as const
export const recurrenceMonthlyModes = ['date', 'weekday'] as const
export const recurrenceCountMin = 1
export const recurrenceCountMax = 365

export type ScheduleColor = (typeof scheduleColors)[number]
export type ScheduleId = string
export type RecurrenceFrequency = (typeof recurrenceFrequencies)[number]
export type RecurrenceEndMode = (typeof recurrenceEndModes)[number]
export type RecurrenceMonthlyMode = (typeof recurrenceMonthlyModes)[number]

// 予定の繰り返しルール。frequency が none のときは他の値を使わない。
export interface ScheduleRecurrence {
  frequency: RecurrenceFrequency
  monthlyMode: RecurrenceMonthlyMode | null
  endMode: RecurrenceEndMode
  untilDate: string | null
  count: number | null
}

export const defaultScheduleRecurrence: ScheduleRecurrence = {
  frequency: 'none',
  monthlyMode: null,
  endMode: 'never',
  untilDate: null,
  count: null,
}

// 新規作成・編集フォームから受け取る基本情報。
export interface ScheduleBase {
  title: string
  startAt: string
  endAt: string
  allDay: boolean
  memo: string
  color: ScheduleColor
  recurrence: ScheduleRecurrence
}

// 保存済みの予定には id と作成/更新日時を追加する。
export interface Schedule extends ScheduleBase {
  id: ScheduleId
  createdAt: string
  updatedAt: string
}

export type ScheduleInput = ScheduleBase & {
  // id があれば更新、なければ新規作成として扱う。
  id?: ScheduleId
}

// 繰り返し予定を画面表示用に展開した1回分の予定。
export interface ScheduleOccurrence extends Omit<Schedule, 'id' | 'startAt' | 'endAt'> {
  id: string
  scheduleId: ScheduleId
  startAt: string
  endAt: string
  occurrenceIndex: number
}

// unknown を安全に型へ絞り込むための関数。main process の入力検証でも使う。
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

export function isRecurrenceMonthlyMode(
  value: unknown,
): value is RecurrenceMonthlyMode {
  return (
    typeof value === 'string' &&
    (recurrenceMonthlyModes as readonly string[]).includes(value)
  )
}
