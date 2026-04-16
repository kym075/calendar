import { addMonths, format, isSameDay, isSameMonth, isToday } from 'date-fns'
import { ja } from 'date-fns/locale'
import { createMonthGrid, toDateKey } from '../utils/calendar'
import type { Schedule, ScheduleColor } from '../../shared/types/schedule'

const weekLabels = ['日', '月', '火', '水', '木', '金', '土'] as const
const badgeClassMap: Record<ScheduleColor, string> = {
  slate: 'bg-slate-600 text-white',
  sky: 'bg-sky-500 text-white',
  emerald: 'bg-emerald-500 text-white',
  amber: 'bg-amber-400 text-slate-900',
  rose: 'bg-rose-500 text-white',
  violet: 'bg-violet-500 text-white',
}
const dotClassMap: Record<ScheduleColor, string> = {
  slate: 'bg-slate-500',
  sky: 'bg-sky-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-400',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
}

interface CalendarViewProps {
  viewMonth: Date
  selectedDate: Date
  schedulesByDate: Record<string, Schedule[]>
  onChangeMonth: (nextMonth: Date) => void
  onSelectDate: (date: Date) => void
}

function getDominantColor(schedules: Schedule[]): ScheduleColor {
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

export function CalendarView({
  viewMonth,
  selectedDate,
  schedulesByDate,
  onChangeMonth,
  onSelectDate,
}: CalendarViewProps) {
  const days = createMonthGrid(viewMonth)
  const rowCount = Math.ceil(days.length / 7)

  return (
    <section className="min-h-0 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 lg:flex lg:h-full lg:flex-col">
      <header className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={() => onChangeMonth(addMonths(viewMonth, -1))}
        >
          前月
        </button>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {format(viewMonth, 'yyyy年M月', { locale: ja })}
        </h2>
        <button
          type="button"
          className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
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
        className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-700 lg:min-h-0 lg:flex-1"
        style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}
      >
        {days.map((date) => {
          const key = toDateKey(date)
          const schedules = schedulesByDate[key] ?? []
          const uniqueColors = [...new Set(schedules.map((item) => item.color))]
          const dominantColor =
            schedules.length > 0 ? getDominantColor(schedules) : null
          const selected = isSameDay(date, selectedDate)
          const inMonth = isSameMonth(date, viewMonth)
          const today = isToday(date)

          return (
            <button
              key={key}
              type="button"
              className={[
                'min-h-16 bg-white p-1.5 text-left transition-colors md:min-h-[4.5rem] md:p-2 lg:h-full lg:min-h-0',
                'hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800',
                inMonth
                  ? 'text-slate-800 dark:text-slate-100'
                  : 'text-slate-400 dark:text-slate-600',
                selected ? 'ring-2 ring-sky-500 ring-inset' : '',
              ].join(' ')}
              onClick={() => onSelectDate(date)}
            >
              <span
                className={[
                  'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium',
                  today ? 'bg-sky-500 text-white' : '',
                ].join(' ')}
              >
                {format(date, 'd')}
              </span>
              {schedules.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  <p
                    className={[
                      'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                      dominantColor ? badgeClassMap[dominantColor] : '',
                    ].join(' ')}
                  >
                    {schedules.length}件
                  </p>
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
                </div>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
