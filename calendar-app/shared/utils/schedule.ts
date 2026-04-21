import { isValid, parseISO } from 'date-fns'
import type { Schedule } from '../types/schedule'

function toSortableTime(isoText: string): number {
  const parsed = parseISO(isoText)
  return isValid(parsed) ? parsed.getTime() : Number.POSITIVE_INFINITY
}

export function sortSchedules(items: Schedule[]): Schedule[] {
  return [...items].sort(
    (a, b) =>
      toSortableTime(a.startAt) - toSortableTime(b.startAt) ||
      a.title.localeCompare(b.title, 'ja'),
  )
}
