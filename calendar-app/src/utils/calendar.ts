import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfDay,
  startOfWeek,
  subMilliseconds,
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
    const startAt = parseISO(schedule.startAt)
    const endAt = parseISO(schedule.endAt)
    if (!isValid(startAt) || !isValid(endAt)) {
      continue
    }

    const midnightEnd =
      endAt.getHours() === 0 &&
      endAt.getMinutes() === 0 &&
      endAt.getSeconds() === 0 &&
      endAt.getMilliseconds() === 0

    const displayEnd = midnightEnd ? subMilliseconds(endAt, 1) : endAt
    const rangeEnd = displayEnd.getTime() < startAt.getTime() ? startAt : displayEnd

    const days = eachDayOfInterval({
      start: startOfDay(startAt),
      end: startOfDay(rangeEnd),
    })

    for (const day of days) {
      const key = toDateKey(day)
      if (!map[key]) {
        map[key] = []
      }
      map[key].push(schedule)
    }
  }

  for (const key of Object.keys(map)) {
    map[key].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    )
  }

  return map
}
