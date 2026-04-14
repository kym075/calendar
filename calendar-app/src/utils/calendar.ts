import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { Schedule } from '../../shared/types/schedule'

export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function createMonthGrid(viewMonth: Date): Date[] {
  const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 })

  const dates: Date[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) {
    dates.push(day)
  }
  return dates
}

export function buildScheduleMap(items: Schedule[]): Record<string, Schedule[]> {
  const map: Record<string, Schedule[]> = {}

  for (const schedule of items) {
    const key = toDateKey(parseISO(schedule.startAt))
    if (!map[key]) {
      map[key] = []
    }
    map[key].push(schedule)
  }

  for (const key of Object.keys(map)) {
    map[key].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    )
  }

  return map
}
