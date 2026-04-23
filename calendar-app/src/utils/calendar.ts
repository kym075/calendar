import {
  addDays,
  eachDayOfInterval,
  endOfYear,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfYear,
  startOfMonth,
  startOfDay,
  startOfWeek,
  subMilliseconds,
} from 'date-fns'
import type { Schedule, ScheduleOccurrence } from '../../shared/types/schedule'
import { getScheduleOccurrencesForRange } from '../../shared/utils/schedule'

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

export function createWeekGrid(viewDate: Date): Date[] {
  const start = startOfWeek(viewDate, { weekStartsOn: 0 })
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export function toMonthKey(date: Date): string {
  return format(date, 'yyyy-MM')
}

interface ScheduleDisplayRange {
  startDay: Date
  endDay: Date
  isMultiDay: boolean
}

export function getScheduleDisplayRange(
  schedule: Pick<ScheduleOccurrence, 'startAt' | 'endAt'>,
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

export function buildScheduleMap(
  items: Schedule[],
  rangeStart: Date,
  rangeEnd: Date,
): Record<string, ScheduleOccurrence[]> {
  const map: Record<string, ScheduleOccurrence[]> = {}
  const occurrences = getScheduleOccurrencesForRange(
    items,
    startOfDay(rangeStart),
    endOfDay(rangeEnd),
  )

  for (const occurrence of occurrences) {
    const displayRange = getScheduleDisplayRange(occurrence)
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
      map[key].push(occurrence)
    }
  }

  for (const key of Object.keys(map)) {
    map[key].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    )
  }

  return map
}

export function buildDayScheduleList(
  items: Schedule[],
  day: Date,
): ScheduleOccurrence[] {
  return getScheduleOccurrencesForRange(items, startOfDay(day), endOfDay(day))
}

export function buildYearMonthCountMap(
  items: Schedule[],
  yearDate: Date,
): Record<string, number> {
  const map: Record<string, number> = {}
  const occurrences = getScheduleOccurrencesForRange(
    items,
    startOfYear(yearDate),
    endOfYear(yearDate),
  )

  for (const occurrence of occurrences) {
    const startAt = parseISO(occurrence.startAt)
    if (!isValid(startAt)) {
      continue
    }
    const key = toMonthKey(startAt)
    map[key] = (map[key] ?? 0) + 1
  }

  return map
}
