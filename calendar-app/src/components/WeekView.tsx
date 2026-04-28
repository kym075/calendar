import {
  addWeeks,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  parseISO,
} from 'date-fns'
import { ja } from 'date-fns/locale'
import { useRef } from 'react'
import type { ScheduleColor, ScheduleOccurrence } from '../../shared/types/schedule'
import type { DailyWeather } from '../../shared/types/weather'
import { createWeekGrid, toDateKey } from '../utils/calendar'

const weekLabels = ['日', '月', '火', '水', '木', '金', '土'] as const

const dotClassMap: Record<ScheduleColor, string> = {
  yellow: 'bg-yellow-300',
  sky: 'bg-sky-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-orange-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
}

interface WeekViewProps {
  viewWeek: Date
  selectedDate: Date
  schedulesByDate: Record<string, ScheduleOccurrence[]>
  weatherByDate: Record<string, DailyWeather>
  onChangeWeek: (nextWeek: Date) => void
  onSelectDate: (date: Date) => void
  onDateDoubleTap?: (date: Date) => void
}

function formatTimeLabel(schedule: ScheduleOccurrence): string {
  if (schedule.allDay) {
    return '終日'
  }
  const start = parseISO(schedule.startAt)
  const end = parseISO(schedule.endAt)
  return `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`
}

export function WeekView({
  viewWeek,
  selectedDate,
  schedulesByDate,
  weatherByDate,
  onChangeWeek,
  onSelectDate,
  onDateDoubleTap,
}: WeekViewProps) {
  const lastTapRef = useRef<{ key: string; time: number } | null>(null)
  const days = createWeekGrid(viewWeek)
  const weekStart = days[0] ?? viewWeek
  const weekEnd = endOfWeek(viewWeek, { weekStartsOn: 0 })

  const handleDateTap = (date: Date, key: string, tapTimeMs: number): void => {
    onSelectDate(date)
    if (!onDateDoubleTap) {
      return
    }

    const prev = lastTapRef.current
    if (prev && prev.key === key && tapTimeMs - prev.time <= 320) {
      onDateDoubleTap(date)
      lastTapRef.current = null
      return
    }
    lastTapRef.current = { key, time: tapTimeMs }
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <header className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 sm:px-3 sm:text-sm dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={() => onChangeWeek(addWeeks(viewWeek, -1))}
        >
          前週
        </button>
        <h2 className="text-base font-semibold text-slate-800 sm:text-lg dark:text-slate-100">
          {format(weekStart, 'M/d', { locale: ja })} -{' '}
          {format(weekEnd, 'M/d', { locale: ja })}
        </h2>
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 sm:px-3 sm:text-sm dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={() => onChangeWeek(addWeeks(viewWeek, 1))}
        >
          次週
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-7">
        {days.map((date, index) => {
          const key = toDateKey(date)
          const daySchedules = schedulesByDate[key] ?? []
          const weather = weatherByDate[key] ?? null
          const selected = isSameDay(date, selectedDate)
          const today = isToday(date)
          const dayLabelClass =
            index === 0
              ? 'text-rose-500'
              : index === 6
                ? 'text-sky-500'
                : 'text-slate-500 dark:text-slate-400'

          return (
            <button
              key={key}
              type="button"
              className={[
                'flex min-h-28 flex-col rounded-lg border p-2 text-left',
                selected
                  ? 'border-sky-400 ring-2 ring-sky-500 ring-inset'
                  : 'border-slate-200 dark:border-slate-700',
                'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800',
              ].join(' ')}
              onClick={(event) => handleDateTap(date, key, event.timeStamp)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={[
                      'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium',
                      today ? 'bg-sky-500 text-white' : 'text-slate-700 dark:text-slate-100',
                    ].join(' ')}
                  >
                    {format(date, 'd')}
                  </span>
                  <p className={['text-xs font-semibold', dayLabelClass].join(' ')}>
                    {weekLabels[index]}
                  </p>
                </div>
                {weather && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-sm leading-none text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {weather.weatherShortLabel}
                  </span>
                )}
              </div>

              {weather && (
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  {weather.weatherLabel}
                  {weather.temperatureMaxC !== null && weather.temperatureMinC !== null
                    ? ` ${weather.temperatureMaxC}/${weather.temperatureMinC}℃`
                    : ''}
                </p>
              )}

              <div className="mt-2 space-y-1">
                {daySchedules.length === 0 && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    予定なし
                  </p>
                )}
                {daySchedules.slice(0, 3).map((schedule) => (
                  <div key={schedule.id} className="flex items-start gap-1.5">
                    <span
                      className={[
                        'mt-1 h-2 w-2 shrink-0 rounded-full',
                        dotClassMap[schedule.color],
                      ].join(' ')}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        {schedule.title}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {formatTimeLabel(schedule)}
                      </p>
                    </div>
                  </div>
                ))}
                {daySchedules.length > 3 && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    +{daySchedules.length - 3}件
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
