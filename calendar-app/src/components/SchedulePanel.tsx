import {
  addDays,
  format,
  isBefore,
  isSameDay,
  isValid,
  parse,
  parseISO,
  set,
  startOfDay,
  subDays,
} from 'date-fns'
import { useMemo, useState } from 'react'
import type {
  RecurrenceEndMode,
  RecurrenceFrequency,
  Schedule,
  ScheduleColor,
  ScheduleId,
  ScheduleInput,
  ScheduleOccurrence,
  ScheduleRecurrence,
} from '../../shared/types/schedule'
import {
  defaultScheduleRecurrence,
  recurrenceCountMax,
  recurrenceCountMin,
  scheduleMemoMaxLength,
  scheduleTitleMaxLength,
} from '../../shared/types/schedule'

const colorClassMap: Record<ScheduleColor, string> = {
  slate: 'bg-slate-500',
  sky: 'bg-sky-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
}
const colorLabelMap: Record<ScheduleColor, string> = {
  slate: 'スレート',
  sky: 'スカイ',
  emerald: 'エメラルド',
  amber: 'アンバー',
  rose: 'ローズ',
  violet: 'バイオレット',
}
const recurrenceFrequencyLabelMap: Record<RecurrenceFrequency, string> = {
  none: '繰り返さない',
  daily: '毎日',
  weekly: '毎週',
  monthly: '毎月',
}

const colorOptions: ScheduleColor[] = [
  'slate',
  'sky',
  'emerald',
  'amber',
  'rose',
  'violet',
]

interface SchedulePanelProps {
  selectedDate: Date
  daySchedules: ScheduleOccurrence[]
  editingSchedule: Schedule | null
  onSubmit: (input: ScheduleInput) => Promise<void>
  onDelete: (id: ScheduleId) => Promise<void>
  onStartEdit: (id: ScheduleId) => void
  onCancelEdit: () => void
  viewMode?: 'full' | 'list' | 'form'
  onRequestClose?: () => void
  className?: string
}

function parseTimeLabel(timeLabel: string): { hours: number; minutes: number } {
  const [hoursText, minutesText] = timeLabel.split(':')
  const hours = Number(hoursText)
  const minutes = Number(minutesText)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return { hours: 9, minutes: 0 }
  }
  return { hours, minutes }
}

function toTimeInput(isoText: string): string {
  return format(parseISO(isoText), 'HH:mm')
}

function toDateInput(isoText: string): string {
  return format(parseISO(isoText), 'yyyy-MM-dd')
}

function formatSchedulePeriod(schedule: ScheduleOccurrence): string {
  const start = parseISO(schedule.startAt)
  const end = parseISO(schedule.endAt)
  if (schedule.allDay) {
    const displayEnd = subDays(end, 1)
    if (isSameDay(start, displayEnd)) {
      return `${format(start, 'M/d')} 終日`
    }
    return `${format(start, 'M/d')} - ${format(displayEnd, 'M/d')} 終日`
  }
  if (isSameDay(start, end)) {
    return `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`
  }
  return `${format(start, 'M/d HH:mm')} - ${format(end, 'M/d HH:mm')}`
}

function formatRecurrenceLabel(schedule: ScheduleOccurrence): string {
  const recurrence = schedule.recurrence
  if (recurrence.frequency === 'none') {
    return '単発'
  }
  const frequencyLabel = recurrenceFrequencyLabelMap[recurrence.frequency]
  if (recurrence.endMode === 'onDate' && recurrence.untilDate) {
    return `${frequencyLabel} (${recurrence.untilDate}まで)`
  }
  if (recurrence.endMode === 'afterCount' && recurrence.count !== null) {
    return `${frequencyLabel} (${recurrence.count}回)`
  }
  return `${frequencyLabel} (無期限)`
}

interface FormInitialValues {
  title: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  allDay: boolean
  memo: string
  color: ScheduleColor
  recurrenceFrequency: RecurrenceFrequency
  recurrenceEndMode: RecurrenceEndMode
  recurrenceUntilDate: string
  recurrenceCount: string
}

function createFormInitialValues(
  selectedDate: Date,
  editingSchedule: Schedule | null,
): FormInitialValues {
  if (!editingSchedule) {
    return {
      title: '',
      startDate: format(selectedDate, 'yyyy-MM-dd'),
      startTime: '09:00',
      endDate: format(selectedDate, 'yyyy-MM-dd'),
      endTime: '10:00',
      allDay: false,
      memo: '',
      color: 'sky',
      recurrenceFrequency: 'none',
      recurrenceEndMode: 'never',
      recurrenceUntilDate: format(selectedDate, 'yyyy-MM-dd'),
      recurrenceCount: '10',
    }
  }

  const end = parseISO(editingSchedule.endAt)
  const recurrence = editingSchedule.recurrence ?? defaultScheduleRecurrence
  return {
    title: editingSchedule.title,
    startDate: toDateInput(editingSchedule.startAt),
    startTime: editingSchedule.allDay ? '09:00' : toTimeInput(editingSchedule.startAt),
    endDate: editingSchedule.allDay
      ? format(subDays(end, 1), 'yyyy-MM-dd')
      : toDateInput(editingSchedule.endAt),
    endTime: editingSchedule.allDay ? '10:00' : toTimeInput(editingSchedule.endAt),
    allDay: editingSchedule.allDay,
    memo: editingSchedule.memo,
    color: editingSchedule.color,
    recurrenceFrequency: recurrence.frequency,
    recurrenceEndMode: recurrence.endMode,
    recurrenceUntilDate: recurrence.untilDate ?? toDateInput(editingSchedule.startAt),
    recurrenceCount:
      recurrence.count !== null ? String(recurrence.count) : '10',
  }
}

function buildRecurrenceFromForm(
  recurrenceFrequency: RecurrenceFrequency,
  recurrenceEndMode: RecurrenceEndMode,
  recurrenceUntilDate: string,
  recurrenceCount: string,
  selectedDate: Date,
  startAt: Date,
): { recurrence: ScheduleRecurrence | null; error: string | null } {
  if (recurrenceFrequency === 'none') {
    return { recurrence: defaultScheduleRecurrence, error: null }
  }

  if (recurrenceEndMode === 'onDate') {
    const untilDay = parse(recurrenceUntilDate, 'yyyy-MM-dd', selectedDate)
    if (!isValid(untilDay)) {
      return { recurrence: null, error: '繰り返しの終了日を正しく入力してください。' }
    }
    if (isBefore(startOfDay(untilDay), startOfDay(startAt))) {
      return { recurrence: null, error: '繰り返しの終了日は開始日以降にしてください。' }
    }
    return {
      recurrence: {
        frequency: recurrenceFrequency,
        endMode: 'onDate',
        untilDate: recurrenceUntilDate,
        count: null,
      },
      error: null,
    }
  }

  if (recurrenceEndMode === 'afterCount') {
    const count = Number.parseInt(recurrenceCount, 10)
    if (
      !Number.isInteger(count) ||
      count < recurrenceCountMin ||
      count > recurrenceCountMax
    ) {
      return {
        recurrence: null,
        error: `繰り返し回数は${recurrenceCountMin}〜${recurrenceCountMax}で入力してください。`,
      }
    }
    return {
      recurrence: {
        frequency: recurrenceFrequency,
        endMode: 'afterCount',
        untilDate: null,
        count,
      },
      error: null,
    }
  }

  return {
    recurrence: {
      frequency: recurrenceFrequency,
      endMode: 'never',
      untilDate: null,
      count: null,
    },
    error: null,
  }
}

interface OverlapWarningItem {
  scheduleId: string
  title: string
  firstStartAt: string
  count: number
}

function detectDayOverlapWarnings(daySchedules: ScheduleOccurrence[]): OverlapWarningItem[] {
  if (daySchedules.length < 2) {
    return []
  }

  const timedItems: Array<{
    scheduleId: string
    title: string
    startAt: string
    startMs: number
    endMs: number
  }> = []

  for (const item of daySchedules) {
    if (item.allDay) {
      continue
    }
    const start = parseISO(item.startAt)
    const end = parseISO(item.endAt)
    if (!isValid(start) || !isValid(end)) {
      continue
    }
    if (!isSameDay(start, end)) {
      continue
    }
    if (!isBefore(start, end)) {
      continue
    }

    timedItems.push({
      scheduleId: item.scheduleId,
      title: item.title,
      startAt: item.startAt,
      startMs: start.getTime(),
      endMs: end.getTime(),
    })
  }

  if (timedItems.length < 2) {
    return []
  }

  const warningMap = new Map<string, OverlapWarningItem>()
  const upsertWarning = (item: (typeof timedItems)[number]): void => {
    const prev = warningMap.get(item.scheduleId)
    if (!prev) {
      warningMap.set(item.scheduleId, {
        scheduleId: item.scheduleId,
        title: item.title,
        firstStartAt: item.startAt,
        count: 1,
      })
      return
    }

    prev.count += 1
    if (item.startMs < parseISO(prev.firstStartAt).getTime()) {
      prev.firstStartAt = item.startAt
    }
  }

  for (let i = 0; i < timedItems.length - 1; i += 1) {
    const current = timedItems[i]
    for (let j = i + 1; j < timedItems.length; j += 1) {
      const candidate = timedItems[j]
      if (current.startMs < candidate.endMs && current.endMs > candidate.startMs) {
        upsertWarning(current)
        upsertWarning(candidate)
      }
    }
  }

  return [...warningMap.values()].sort(
    (a, b) =>
      parseISO(a.firstStartAt).getTime() - parseISO(b.firstStartAt).getTime(),
  )
}

export function SchedulePanel({
  selectedDate,
  daySchedules,
  editingSchedule,
  onSubmit,
  onDelete,
  onStartEdit,
  onCancelEdit,
  viewMode = 'full',
  onRequestClose,
  className = '',
}: SchedulePanelProps) {
  const showForm = viewMode !== 'list'
  const showList = viewMode !== 'form'
  const showPrimaryAction = viewMode !== 'list'

  const initialFormValues = createFormInitialValues(selectedDate, editingSchedule)
  const [title, setTitle] = useState(initialFormValues.title)
  const [startDate, setStartDate] = useState(initialFormValues.startDate)
  const [startTime, setStartTime] = useState(initialFormValues.startTime)
  const [endDate, setEndDate] = useState(initialFormValues.endDate)
  const [endTime, setEndTime] = useState(initialFormValues.endTime)
  const [allDay, setAllDay] = useState(initialFormValues.allDay)
  const [memo, setMemo] = useState(initialFormValues.memo)
  const [color, setColor] = useState<ScheduleColor>(initialFormValues.color)
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>(
    initialFormValues.recurrenceFrequency,
  )
  const [recurrenceEndMode, setRecurrenceEndMode] = useState<RecurrenceEndMode>(
    initialFormValues.recurrenceEndMode,
  )
  const [recurrenceUntilDate, setRecurrenceUntilDate] = useState(
    initialFormValues.recurrenceUntilDate,
  )
  const [recurrenceCount, setRecurrenceCount] = useState(
    initialFormValues.recurrenceCount,
  )
  const [formError, setFormError] = useState<string | null>(null)
  const overlapWarnings = useMemo(
    () => detectDayOverlapWarnings(daySchedules),
    [daySchedules],
  )

  const handleStartDateChange = (nextStartDate: string): void => {
    setStartDate(nextStartDate)
    if (recurrenceEndMode === 'onDate' && recurrenceUntilDate < nextStartDate) {
      setRecurrenceUntilDate(nextStartDate)
    }
  }

  const handleSubmit = async (): Promise<void> => {
    setFormError(null)
    const normalizedTitle = title.trim()
    const normalizedMemo = memo.trim()

    if (normalizedTitle.length === 0) {
      setFormError('タイトルを入力してください。')
      return
    }
    if (normalizedTitle.length > scheduleTitleMaxLength) {
      setFormError(`タイトルは${scheduleTitleMaxLength}文字以内で入力してください。`)
      return
    }
    if (normalizedMemo.length > scheduleMemoMaxLength) {
      setFormError(`メモは${scheduleMemoMaxLength}文字以内で入力してください。`)
      return
    }

    const startDay = parse(startDate, 'yyyy-MM-dd', selectedDate)
    const endDay = parse(endDate, 'yyyy-MM-dd', selectedDate)
    if (!isValid(startDay) || !isValid(endDay)) {
      setFormError('開始日・終了日を正しく入力してください。')
      return
    }

    let startAt: Date
    let endAt: Date
    if (allDay) {
      startAt = startOfDay(startDay)
      endAt = startOfDay(addDays(endDay, 1))
      if (!isBefore(startAt, endAt)) {
        setFormError('終了日は開始日以降にしてください。')
        return
      }
    } else {
      const startClock = parseTimeLabel(startTime)
      const endClock = parseTimeLabel(endTime)
      startAt = set(startDay, {
        hours: startClock.hours,
        minutes: startClock.minutes,
        seconds: 0,
        milliseconds: 0,
      })
      endAt = set(endDay, {
        hours: endClock.hours,
        minutes: endClock.minutes,
        seconds: 0,
        milliseconds: 0,
      })

      if (!isBefore(startAt, endAt)) {
        setFormError('開始時刻は終了時刻より前にしてください。')
        return
      }
    }

    const recurrenceResult = buildRecurrenceFromForm(
      recurrenceFrequency,
      recurrenceEndMode,
      recurrenceUntilDate,
      recurrenceCount,
      selectedDate,
      startAt,
    )
    if (!recurrenceResult.recurrence) {
      setFormError(recurrenceResult.error ?? '繰り返し設定が不正です。')
      return
    }
    const recurrence = recurrenceResult.recurrence

    await onSubmit({
      id: editingSchedule?.id,
      title: normalizedTitle,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      allDay,
      memo: normalizedMemo,
      color,
      recurrence,
    })
  }

  return (
    <section
      className={[
        'space-y-3 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90',
        'lg:min-h-0 lg:h-full lg:overflow-y-auto lg:pr-2',
        className,
      ].join(' ')}
    >
      <header className="shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 sm:text-lg">
            {format(selectedDate, 'M月d日')} の予定
          </h2>
          <div className="flex items-center gap-2">
            {showPrimaryAction && (
              <button
                type="button"
                className="shrink-0 rounded-md bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-700 sm:px-3 sm:py-2 sm:text-sm"
                onClick={() => void handleSubmit()}
              >
                {editingSchedule ? (
                  '更新'
                ) : (
                  <>
                    <span className="sm:hidden">追加</span>
                    <span className="hidden sm:inline">予定を追加</span>
                  </>
                )}
              </button>
            )}
            {onRequestClose && (
              <button
                type="button"
                className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={onRequestClose}
              >
                閉じる
              </button>
            )}
          </div>
        </div>
        {editingSchedule && showForm && (
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={onCancelEdit}
            >
              キャンセル
            </button>
          </div>
        )}
      </header>

      {showForm && (
        <div className="shrink-0 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
              タイトル
            </label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={scheduleTitleMaxLength}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="mt-1 text-right text-[11px] text-slate-500 dark:text-slate-400">
              {title.length}/{scheduleTitleMaxLength}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                開始日
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(event) => handleStartDateChange(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                開始時刻
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                disabled={allDay}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                終了日
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                終了時刻
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                disabled={allDay}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(event) => setAllDay(event.target.checked)}
              className="h-4 w-4 accent-sky-600"
            />
            終日予定
          </label>

          <div className="space-y-2 rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700">
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                繰り返し
              </label>
              <select
                value={recurrenceFrequency}
                onChange={(event) =>
                  setRecurrenceFrequency(event.target.value as RecurrenceFrequency)
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="none">繰り返さない</option>
                <option value="daily">毎日</option>
                <option value="weekly">毎週</option>
                <option value="monthly">毎月</option>
              </select>
            </div>

            {recurrenceFrequency !== 'none' && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                    終了条件
                  </label>
                  <select
                    value={recurrenceEndMode}
                    onChange={(event) =>
                      setRecurrenceEndMode(event.target.value as RecurrenceEndMode)
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="never">なし（無期限）</option>
                    <option value="onDate">終了日を指定</option>
                    <option value="afterCount">回数を指定</option>
                  </select>
                </div>

                {recurrenceEndMode === 'onDate' && (
                  <div>
                    <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                      終了日
                    </label>
                    <input
                      type="date"
                      value={recurrenceUntilDate}
                      onChange={(event) => setRecurrenceUntilDate(event.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                )}

                {recurrenceEndMode === 'afterCount' && (
                  <div>
                    <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                      回数
                    </label>
                    <input
                      type="number"
                      min={recurrenceCountMin}
                      max={recurrenceCountMax}
                      value={recurrenceCount}
                      onChange={(event) => setRecurrenceCount(event.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {overlapWarnings.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/50 dark:bg-amber-900/20 dark:text-amber-300">
              <p className="font-semibold">
                時間が重なる予定があります（{overlapWarnings.length}件）
              </p>
              <p className="mt-0.5">保存は可能ですが、内容を確認してください。</p>
              <ul className="mt-1 space-y-0.5">
                {overlapWarnings.slice(0, 3).map((warning) => (
                  <li key={warning.scheduleId}>
                    {warning.title}（{format(parseISO(warning.firstStartAt), 'M/d HH:mm')}）
                    {warning.count > 1 ? ` +${warning.count - 1}件` : ''}
                  </li>
                ))}
              </ul>
              {overlapWarnings.length > 3 && (
                <p className="mt-0.5">ほか {overlapWarnings.length - 3} 件</p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
              メモ
            </label>
            <textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              rows={3}
              maxLength={scheduleMemoMaxLength}
              wrap="soft"
              className="w-full resize-y overflow-x-hidden rounded-md border border-slate-300 px-3 py-2 text-sm break-words [overflow-wrap:anywhere] outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="mt-1 text-right text-[11px] text-slate-500 dark:text-slate-400">
              {memo.length}/{scheduleMemoMaxLength}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
              カラー
            </label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={[
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-[10px] font-bold text-white transition',
                    colorClassMap[option],
                    color === option
                      ? 'scale-110 border-black/70 shadow-md dark:border-white'
                      : 'border-transparent opacity-75 hover:opacity-100',
                  ].join(' ')}
                  onClick={() => setColor(option)}
                  aria-label={option}
                  aria-pressed={color === option}
                >
                  {color === option ? '✓' : ''}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              選択中: <span className="font-semibold">{colorLabelMap[color]}</span>
            </p>
          </div>

          {formError && (
            <p className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">
              {formError}
            </p>
          )}
        </div>
      )}

      {showList && (
        <div className="space-y-2 overflow-x-hidden">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            その日の予定一覧
          </h3>
          {daySchedules.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              予定はまだありません。
            </p>
          )}
          {daySchedules.map((item) => (
            <article
              key={item.id}
              className="rounded-md border border-slate-200 p-3 dark:border-slate-700"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatSchedulePeriod(item)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatRecurrenceLabel(item)}
                  </p>
                </div>
                <span
                  className={['mt-1 h-3 w-3 rounded-full', colorClassMap[item.color]].join(
                    ' ',
                  )}
                />
              </div>
              {item.memo && (
                <p className="mt-2 text-xs whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-slate-600 dark:text-slate-300">
                  {item.memo}
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => onStartEdit(item.scheduleId)}
                >
                  編集
                </button>
                <button
                  type="button"
                  className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-500/50 dark:text-rose-400 dark:hover:bg-rose-900/30"
                  onClick={() => void onDelete(item.scheduleId)}
                >
                  削除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
