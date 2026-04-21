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
import { useState } from 'react'
import type {
  Schedule,
  ScheduleColor,
  ScheduleId,
  ScheduleInput,
} from '../../shared/types/schedule'
import {
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
  daySchedules: Schedule[]
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

function formatSchedulePeriod(schedule: Schedule): string {
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

interface FormInitialValues {
  title: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  allDay: boolean
  memo: string
  color: ScheduleColor
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
    }
  }

  const end = parseISO(editingSchedule.endAt)
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
  }
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
  const [formError, setFormError] = useState<string | null>(null)

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

    await onSubmit({
      id: editingSchedule?.id,
      title: normalizedTitle,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      allDay,
      memo: normalizedMemo,
      color,
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
                onChange={(event) => setStartDate(event.target.value)}
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
                  onClick={() => onStartEdit(item.id)}
                >
                  編集
                </button>
                <button
                  type="button"
                  className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-500/50 dark:text-rose-400 dark:hover:bg-rose-900/30"
                  onClick={() => void onDelete(item.id)}
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
