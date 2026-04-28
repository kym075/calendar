import { addMonths, format, isSameDay, isSameMonth, isToday, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useRef } from 'react'
import {
  createMonthGrid,
  getScheduleDisplayRange,
  toDateKey,
} from '../utils/calendar'
import type {
  ScheduleColor,
  ScheduleOccurrence,
} from '../../shared/types/schedule'
import type { DailyWeather } from '../../shared/types/weather'

const weekLabels = ['日', '月', '火', '水', '木', '金', '土'] as const
const badgeClassMap: Record<ScheduleColor, string> = {
  yellow: 'bg-yellow-300 text-slate-900',
  sky: 'bg-sky-500 text-white',
  emerald: 'bg-emerald-500 text-white',
  amber: 'bg-orange-500 text-white',
  rose: 'bg-rose-500 text-white',
  violet: 'bg-violet-500 text-white',
}
const dotClassMap: Record<ScheduleColor, string> = {
  yellow: 'bg-yellow-300',
  sky: 'bg-sky-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-orange-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
}
const rangeBarClassMap: Record<ScheduleColor, string> = {
  yellow: 'bg-yellow-300/80',
  sky: 'bg-sky-500/80',
  emerald: 'bg-emerald-500/80',
  amber: 'bg-orange-500/80',
  rose: 'bg-rose-500/80',
  violet: 'bg-violet-500/80',
}

interface CalendarViewProps {
  viewMonth: Date
  selectedDate: Date
  schedulesByDate: Record<string, ScheduleOccurrence[]>
  weatherByDate: Record<string, DailyWeather>
  onChangeMonth: (nextMonth: Date) => void
  onSelectDate: (date: Date) => void
  onDateDoubleTap?: (date: Date) => void
}

function getDominantColor(schedules: ScheduleOccurrence[]): ScheduleColor {
  const countMap = new Map<ScheduleColor, number>()

  for (const item of schedules) {
    const current = countMap.get(item.color) ?? 0
    countMap.set(item.color, current + 1)
  }

  let dominant = schedules[0].color
  let max = 0

  for (const [color, count] of countMap) {
    if (count > max) {
      dominant = color
      max = count
    }
  }

  return dominant
}

function formatScheduleTime(schedule: ScheduleOccurrence): string {
  if (schedule.allDay) {
    return '終日'
  }
  return format(parseISO(schedule.startAt), 'HH:mm')
}

export function CalendarView({
  viewMonth,
  selectedDate,
  schedulesByDate,
  weatherByDate,
  onChangeMonth,
  onSelectDate,
  onDateDoubleTap,
}: CalendarViewProps) {
  const lastTapRef = useRef<{ key: string; time: number } | null>(null)
  const days = createMonthGrid(viewMonth)
  const rowCount = Math.ceil(days.length / 7)
  const isDenseMonth = rowCount >= 6

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
          onClick={() => onChangeMonth(addMonths(viewMonth, -1))}
        >
          前月
        </button>
        <h2 className="text-base font-semibold text-slate-800 sm:text-lg dark:text-slate-100">
          {format(viewMonth, 'yyyy年M月', { locale: ja })}
        </h2>
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 sm:px-3 sm:text-sm dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={() => onChangeMonth(addMonths(viewMonth, 1))}
        >
          次月
        </button>
      </header>

      <div className="grid shrink-0 grid-cols-7 text-center text-xs font-semibold">
        {weekLabels.map((label, index) => (
          <div
            key={label}
            className={
              index === 0
                ? 'py-2 text-rose-500'
                : index === 6
                  ? 'py-2 text-sky-500'
                  : 'py-2 text-slate-500 dark:text-slate-400'
            }
          >
            {label}
          </div>
        ))}
      </div>

      <div
        className="grid min-h-0 flex-1 grid-cols-7 overflow-visible rounded-lg border-l border-t border-slate-200 dark:border-slate-700"
        style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}
      >
        {days.map((date, index) => {
          const key = toDateKey(date)
          const schedules = schedulesByDate[key] ?? []
          const weather = weatherByDate[key] ?? null
          const multiDaySegments = schedules
            .map((schedule) => {
              const range = getScheduleDisplayRange(schedule)
              if (!range || !range.isMultiDay) {
                return null
              }

              return {
                id: schedule.id,
                color: schedule.color,
                isStart: isSameDay(range.startDay, date),
                isEnd: isSameDay(range.endDay, date),
              }
            })
            .filter((item): item is {
              id: string
              color: ScheduleColor
              isStart: boolean
              isEnd: boolean
            } => item !== null)
          const uniqueColors = [...new Set(schedules.map((item) => item.color))]
          const dominantColor =
            schedules.length > 0 ? getDominantColor(schedules) : null
          const visibleRangeBars = isDenseMonth
            ? multiDaySegments.slice(0, 1)
            : multiDaySegments.slice(0, 2)
          const selected = isSameDay(date, selectedDate)
          const inMonth = isSameMonth(date, viewMonth)
          const today = isToday(date)
          const dayOfWeek = date.getDay()
          const weekendBorderClass =
            dayOfWeek === 0
              ? 'border-rose-200/80 dark:border-rose-500/40'
              : dayOfWeek === 6
                ? 'border-sky-200/80 dark:border-sky-500/40'
                : 'border-slate-200 dark:border-slate-700'
          const cornerClass = [
            index === 0 ? 'rounded-tl-lg' : '',
            index === 6 ? 'rounded-tr-lg' : '',
            index === days.length - 7 ? 'rounded-bl-lg' : '',
            index === days.length - 1 ? 'rounded-br-lg' : '',
          ].join(' ')

          return (
            <button
              key={key}
              type="button"
              className={[
                'group relative z-0 flex min-h-16 flex-col overflow-visible border-b border-r p-1.5 pt-9 text-left transition-[background-color,box-shadow,transform] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] md:min-h-[4.5rem] md:p-2 md:pt-10 lg:h-full lg:min-h-0',
                cornerClass,
                selected
                  ? 'border-sky-500 bg-sky-100 shadow-[inset_0_0_0_1px_rgb(2_132_199)] after:border-2 after:border-sky-500 hover:z-20 hover:-translate-y-0.5 hover:bg-sky-100 hover:shadow-[inset_0_0_0_1px_rgb(2_132_199),0_10px_24px_rgba(2,132,199,0.18)] dark:border-sky-300 dark:bg-sky-950/55 dark:shadow-[inset_0_0_0_1px_rgb(125_211_252)] dark:after:border-sky-300 dark:hover:bg-sky-950/65 dark:hover:shadow-[inset_0_0_0_1px_rgb(125_211_252),0_10px_24px_rgba(56,189,248,0.18)]'
                  : today
                    ? 'border-amber-400 bg-amber-50 shadow-[inset_0_0_0_1px_rgb(251_191_36)] hover:z-20 hover:-translate-y-0.5 hover:bg-amber-50 hover:shadow-[inset_0_0_0_1px_rgb(251_191_36),0_10px_24px_rgba(217,119,6,0.16)] dark:border-amber-300/80 dark:bg-amber-950/45 dark:shadow-[inset_0_0_0_1px_rgb(252_211_77)] dark:hover:bg-amber-950/55 dark:hover:shadow-[inset_0_0_0_1px_rgb(252_211_77),0_10px_24px_rgba(251,191,36,0.16)]'
                    : `${weekendBorderClass} bg-white hover:z-20 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-lg dark:bg-slate-900 dark:hover:bg-slate-800`,
                inMonth
                  ? 'text-slate-800 dark:text-slate-100'
                  : 'text-slate-300 dark:text-slate-700',
              ].join(' ')}
              onClick={(event) => handleDateTap(date, key, event.timeStamp)}
            >
              <span
                className={[
                  'absolute left-1.5 top-1.5 inline-flex items-center justify-center rounded-full md:left-2 md:top-2',
                  isDenseMonth
                    ? 'h-6 w-6 text-xs font-medium'
                    : 'h-7 w-7 text-sm font-medium',
                  selected
                    ? 'bg-sky-600 text-white dark:bg-sky-300 dark:text-slate-950'
                    : today
                      ? 'bg-amber-400 text-slate-950 shadow-sm dark:bg-amber-300'
                      : inMonth
                        ? 'text-slate-800 dark:text-slate-100'
                        : 'font-normal text-slate-300 dark:text-slate-700',
                ].join(' ')}
              >
                {format(date, 'd')}
              </span>
              {weather && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-sm leading-none text-slate-600 md:right-2 md:top-2 md:text-base dark:bg-slate-800 dark:text-slate-300">
                  {weather.weatherShortLabel}
                </span>
              )}
              {schedules.length > 0 && (
                <div className={isDenseMonth ? 'space-y-0.5' : 'space-y-1'}>
                  <p
                    className={[
                      isDenseMonth
                        ? 'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold'
                        : 'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                      dominantColor ? badgeClassMap[dominantColor] : '',
                    ].join(' ')}
                  >
                    {schedules.length}件
                  </p>
                  {!isDenseMonth && (
                    <div className="flex items-center gap-1">
                      {uniqueColors.slice(0, 3).map((color) => (
                        <span
                          key={color}
                          className={['h-2 w-2 rounded-full', dotClassMap[color]].join(
                            ' ',
                          )}
                        />
                      ))}
                      {uniqueColors.length > 3 && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          +{uniqueColors.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                  {visibleRangeBars.length > 0 && (
                    <div
                      className={
                        isDenseMonth
                          ? '-mx-1.5 pt-0.5 md:-mx-2'
                          : '-mx-1.5 space-y-0.5 pt-0.5 md:-mx-2'
                      }
                    >
                      {visibleRangeBars.map((segment) => (
                        <div
                          key={segment.id}
                          className={[
                            'h-1.5',
                            rangeBarClassMap[segment.color],
                            segment.isStart ? 'rounded-l-full' : '',
                            segment.isEnd ? 'rounded-r-full' : '',
                          ].join(' ')}
                        />
                      ))}
                      {!isDenseMonth && multiDaySegments.length > 2 && (
                        <>
                          <p className="pl-1.5 text-[10px] text-slate-500 dark:text-slate-400 sm:hidden">
                            +{multiDaySegments.length - 2}
                          </p>
                          <p className="hidden pl-1.5 text-[10px] text-slate-500 dark:text-slate-400 sm:block">
                            +{multiDaySegments.length - 2}件の連続予定
                          </p>
                        </>
                      )}
                      {isDenseMonth && multiDaySegments.length > 1 && (
                        <p className="pl-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                          +{multiDaySegments.length - 1}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {schedules.length > 0 && (
                <div className="pointer-events-none absolute left-2 right-2 top-11 z-30 translate-y-1 rounded-md border border-slate-200 bg-white p-2 text-left opacity-0 shadow-xl transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 dark:border-sky-400/45 dark:bg-slate-950/95 dark:shadow-2xl dark:shadow-black/45 dark:backdrop-blur">
                  <p className="mb-1 text-[11px] font-semibold text-slate-700 dark:text-sky-100">
                    {format(date, 'M/d')} の予定
                  </p>
                  <div className="space-y-1">
                    {schedules.slice(0, 5).map((schedule) => (
                      <div key={schedule.id} className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={[
                            'h-2 w-2 shrink-0 rounded-full',
                            dotClassMap[schedule.color],
                          ].join(' ')}
                        />
                        <p className="min-w-0 truncate text-[11px] text-slate-600 dark:text-slate-100">
                          <span className="mr-1 text-slate-400 dark:text-sky-300">
                            {formatScheduleTime(schedule)}
                          </span>
                          {schedule.title}
                        </p>
                      </div>
                    ))}
                    {schedules.length > 5 && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        ほか {schedules.length - 5} 件
                      </p>
                    )}
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
