import { format, isBefore, parseISO, set } from 'date-fns'
import { useEffect, useState } from 'react'
import type {
  Schedule,
  ScheduleColor,
  ScheduleId,
  ScheduleInput,
} from '../../shared/types/schedule'

const colorClassMap: Record<ScheduleColor, string> = {
  slate: 'bg-slate-500',
  sky: 'bg-sky-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
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

export function SchedulePanel({
  selectedDate,
  daySchedules,
  editingSchedule,
  onSubmit,
  onDelete,
  onStartEdit,
  onCancelEdit,
}: SchedulePanelProps) {
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [memo, setMemo] = useState('')
  const [color, setColor] = useState<ScheduleColor>('sky')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (editingSchedule) {
      setTitle(editingSchedule.title)
      setStartTime(toTimeInput(editingSchedule.startAt))
      setEndTime(toTimeInput(editingSchedule.endAt))
      setMemo(editingSchedule.memo)
      setColor(editingSchedule.color)
      setFormError(null)
      return
    }

    setTitle('')
    setStartTime('09:00')
    setEndTime('10:00')
    setMemo('')
    setColor('sky')
    setFormError(null)
  }, [editingSchedule, selectedDate])

  const handleSubmit = async (): Promise<void> => {
    setFormError(null)
    if (title.trim().length === 0) {
      setFormError('タイトルを入力してください。')
      return
    }

    const startClock = parseTimeLabel(startTime)
    const endClock = parseTimeLabel(endTime)
    const startAt = set(selectedDate, {
      hours: startClock.hours,
      minutes: startClock.minutes,
      seconds: 0,
      milliseconds: 0,
    })
    const endAt = set(selectedDate, {
      hours: endClock.hours,
      minutes: endClock.minutes,
      seconds: 0,
      milliseconds: 0,
    })

    if (!isBefore(startAt, endAt)) {
      setFormError('開始時刻は終了時刻より前にしてください。')
      return
    }

    await onSubmit({
      id: editingSchedule?.id,
      title: title.trim(),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      memo: memo.trim(),
      color,
    })
  }

  return (
    <section className="min-h-0 space-y-3 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 lg:flex lg:h-full lg:flex-col lg:space-y-3">
      <header className="shrink-0">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {format(selectedDate, 'M月d日')} の予定
        </h2>
      </header>

      <div className="shrink-0 space-y-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
            タイトル
          </label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
              開始
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
              終了
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
            メモ
          </label>
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
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
                  'h-6 w-6 rounded-full border-2',
                  colorClassMap[option],
                  color === option ? 'border-black/70 dark:border-white' : 'border-transparent',
                ].join(' ')}
                onClick={() => setColor(option)}
                aria-label={option}
              />
            ))}
          </div>
        </div>

        {formError && (
          <p className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">
            {formError}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
            onClick={() => void handleSubmit()}
          >
            {editingSchedule ? '更新' : '追加'}
          </button>
          {editingSchedule && (
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={onCancelEdit}
            >
              キャンセル
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
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
                  {format(parseISO(item.startAt), 'HH:mm')} -{' '}
                  {format(parseISO(item.endAt), 'HH:mm')}
                </p>
              </div>
              <span
                className={['mt-1 h-3 w-3 rounded-full', colorClassMap[item.color]].join(
                  ' ',
                )}
              />
            </div>
            {item.memo && (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
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
    </section>
  )
}
