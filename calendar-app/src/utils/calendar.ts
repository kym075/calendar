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

interface ScheduleDisplayRange {
  startDay: Date
  endDay: Date
  isMultiDay: boolean
}

export function getScheduleDisplayRange(
  schedule: Schedule,
): ScheduleDisplayRange | null {
  const startAt = parseISO(schedule.startAt)
  const endAt = parseISO(schedule.endAt)
  if (!isValid(startAt) || !isValid(endAt)) {
    return null
  }

  const midnightEnd =
    endAt.getHours() === 0 &&
    endAt.getMinutes() === 0 &&
    endAt.getSeconds() === 0 &&
    endAt.getMilliseconds() === 0

  const displayEnd = midnightEnd ? subMilliseconds(endAt, 1) : endAt
  const rangeEnd = displayEnd.getTime() < startAt.getTime() ? startAt : displayEnd
  const startDay = startOfDay(startAt)
  const endDay = startOfDay(rangeEnd)

  return {
    startDay,
    endDay,
    isMultiDay: startDay.getTime() !== endDay.getTime(),
  }
}

export function buildScheduleMap(items: Schedule[]): Record<string, Schedule[]> {
  const map: Record<string, Schedule[]> = {}

  for (const schedule of items) {
    const displayRange = getScheduleDisplayRange(schedule)
    if (!displayRange) {
      continue
    }

    const days = eachDayOfInterval({
      start: displayRange.startDay,
      end: displayRange.endDay,
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
