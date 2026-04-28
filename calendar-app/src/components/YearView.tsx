import {
  addYears,
  eachMonthOfInterval,
  endOfYear,
  format,
  isSameMonth,
  startOfYear,
} from 'date-fns'
import { ja } from 'date-fns/locale'
import { toMonthKey } from '../utils/calendar'

interface YearViewProps {
  viewYear: Date
  selectedDate: Date
  monthCounts: Record<string, number>
  onChangeYear: (nextYear: Date) => void
  onSelectMonth: (date: Date) => void
}

export function YearView({
  viewYear,
  selectedDate,
  monthCounts,
  onChangeYear,
  onSelectMonth,
}: YearViewProps) {
  const months = eachMonthOfInterval({
    start: startOfYear(viewYear),
    end: endOfYear(viewYear),
  })

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <header className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 sm:px-3 sm:text-sm dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={() => onChangeYear(addYears(viewYear, -1))}
        >
          前年
        </button>
        <h2 className="text-base font-semibold text-slate-800 sm:text-lg dark:text-slate-100">
          {format(viewYear, 'yyyy年', { locale: ja })}
        </h2>
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 sm:px-3 sm:text-sm dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={() => onChangeYear(addYears(viewYear, 1))}
        >
          次年
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
        {months.map((monthDate) => {
          const key = toMonthKey(monthDate)
          const count = monthCounts[key] ?? 0
          const selected = isSameMonth(monthDate, selectedDate)

          return (
            <button
              key={key}
              type="button"
              className={[
                'rounded-lg border p-3 text-left',
                selected
                  ? 'border-sky-400 ring-2 ring-sky-500 ring-inset'
                  : 'border-slate-200 dark:border-slate-700',
                'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800',
              ].join(' ')}
              onClick={() => onSelectMonth(monthDate)}
            >
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {format(monthDate, 'M月', { locale: ja })}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                予定 {count}件
              </p>
            </button>
          )
        })}
      </div>
    </section>
  )
}
