import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarMonths,
  isValid,
  parse,
  parseISO,
  startOfDay,
} from 'date-fns'
import type {
  RecurrenceFrequency,
  Schedule,
  ScheduleOccurrence,
  ScheduleRecurrence,
} from '../types/schedule'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

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

function sortOccurrences(items: ScheduleOccurrence[]): ScheduleOccurrence[] {
  return [...items].sort(
    (a, b) =>
      toSortableTime(a.startAt) - toSortableTime(b.startAt) ||
      a.title.localeCompare(b.title, 'ja'),
  )
}

function addOccurrenceOffset(
  base: Date,
  frequency: RecurrenceFrequency,
  occurrenceIndex: number,
): Date {
  switch (frequency) {
    case 'daily':
      return addDays(base, occurrenceIndex)
    case 'weekly':
      return addWeeks(base, occurrenceIndex)
    case 'monthly':
      return addMonths(base, occurrenceIndex)
    case 'none':
      return base
    default:
      return base
  }
}

function parseUntilDate(untilDate: string | null): Date | null {
  if (!untilDate) {
    return null
  }
  const parsed = parse(untilDate, 'yyyy-MM-dd', new Date())
  return isValid(parsed) ? startOfDay(parsed) : null
}

function isOccurrenceAllowed(
  recurrence: ScheduleRecurrence,
  occurrenceStart: Date,
  occurrenceIndex: number,
): boolean {
  if (recurrence.frequency === 'none') {
    return occurrenceIndex === 0
  }

  switch (recurrence.endMode) {
    case 'never':
      return true
    case 'onDate': {
      const untilDay = parseUntilDate(recurrence.untilDate)
      if (!untilDay) {
        return false
      }
      return startOfDay(occurrenceStart).getTime() <= untilDay.getTime()
    }
    case 'afterCount':
      return recurrence.count !== null && occurrenceIndex < recurrence.count
    default:
      return false
  }
}

function getStartIndexForRange(
  baseStart: Date,
  baseEnd: Date,
  recurrence: ScheduleRecurrence,
  rangeStart: Date,
): number {
  switch (recurrence.frequency) {
    case 'daily': {
      const diff = rangeStart.getTime() - baseEnd.getTime()
      return diff <= 0 ? 0 : Math.floor(diff / DAY_MS) + 1
    }
    case 'weekly': {
      const diff = rangeStart.getTime() - baseEnd.getTime()
      return diff <= 0 ? 0 : Math.floor(diff / WEEK_MS) + 1
    }
    case 'monthly': {
      const monthDiff = differenceInCalendarMonths(rangeStart, baseStart)
      return monthDiff <= 1 ? 0 : monthDiff - 1
    }
    case 'none':
    default:
      return 0
  }
}

function getStartIndexForThreshold(
  baseStart: Date,
  recurrence: ScheduleRecurrence,
  threshold: Date,
): number {
  switch (recurrence.frequency) {
    case 'daily': {
      const diff = threshold.getTime() - baseStart.getTime()
      return diff < 0 ? 0 : Math.floor(diff / DAY_MS) + 1
    }
    case 'weekly': {
      const diff = threshold.getTime() - baseStart.getTime()
      return diff < 0 ? 0 : Math.floor(diff / WEEK_MS) + 1
    }
    case 'monthly': {
      const monthDiff = differenceInCalendarMonths(threshold, baseStart)
      return monthDiff <= 0 ? 0 : monthDiff
    }
    case 'none':
    default:
      return 0
  }
}

function createOccurrence(
  schedule: Schedule,
  occurrenceIndex: number,
  occurrenceStart: Date,
  occurrenceEnd: Date,
): ScheduleOccurrence {
  return {
    ...schedule,
    id: `${schedule.id}:${occurrenceIndex}:${occurrenceStart.getTime()}`,
    scheduleId: schedule.id,
    startAt: occurrenceStart.toISOString(),
    endAt: occurrenceEnd.toISOString(),
    occurrenceIndex,
  }
}

export function expandScheduleOccurrencesForRange(
  schedule: Schedule,
  rangeStart: Date,
  rangeEnd: Date,
): ScheduleOccurrence[] {
  const baseStart = parseISO(schedule.startAt)
  const baseEnd = parseISO(schedule.endAt)
  if (
    !isValid(baseStart) ||
    !isValid(baseEnd) ||
    baseStart.getTime() >= baseEnd.getTime() ||
    rangeStart.getTime() > rangeEnd.getTime()
  ) {
    return []
  }

  const rangeStartMs = rangeStart.getTime()
  const rangeEndMs = rangeEnd.getTime()
  const items: ScheduleOccurrence[] = []
  let index = getStartIndexForRange(
    baseStart,
    baseEnd,
    schedule.recurrence,
    rangeStart,
  )

  while (true) {
    const occurrenceStart = addOccurrenceOffset(
      baseStart,
      schedule.recurrence.frequency,
      index,
    )
    if (!isOccurrenceAllowed(schedule.recurrence, occurrenceStart, index)) {
      break
    }

    const occurrenceEnd = addOccurrenceOffset(
      baseEnd,
      schedule.recurrence.frequency,
      index,
    )
    if (occurrenceStart.getTime() > rangeEndMs && schedule.recurrence.frequency !== 'none') {
      break
    }

    if (
      occurrenceEnd.getTime() > rangeStartMs &&
      occurrenceStart.getTime() <= rangeEndMs
    ) {
      items.push(createOccurrence(schedule, index, occurrenceStart, occurrenceEnd))
    }

    if (schedule.recurrence.frequency === 'none') {
      break
    }

    index += 1
  }

  return sortOccurrences(items)
}

export function getScheduleOccurrencesForRange(
  items: Schedule[],
  rangeStart: Date,
  rangeEnd: Date,
): ScheduleOccurrence[] {
  const occurrences = items.flatMap((schedule) =>
    expandScheduleOccurrencesForRange(schedule, rangeStart, rangeEnd),
  )
  return sortOccurrences(occurrences)
}

export function findNextOccurrenceStartingAfter(
  schedule: Schedule,
  threshold: Date,
): ScheduleOccurrence | null {
  const baseStart = parseISO(schedule.startAt)
  const baseEnd = parseISO(schedule.endAt)
  if (!isValid(baseStart) || !isValid(baseEnd) || baseStart.getTime() >= baseEnd.getTime()) {
    return null
  }

  const thresholdMs = threshold.getTime()
  let index = getStartIndexForThreshold(baseStart, schedule.recurrence, threshold)

  while (true) {
    const occurrenceStart = addOccurrenceOffset(
      baseStart,
      schedule.recurrence.frequency,
      index,
    )
    if (!isOccurrenceAllowed(schedule.recurrence, occurrenceStart, index)) {
      return null
    }

    if (occurrenceStart.getTime() >= thresholdMs) {
      const occurrenceEnd = addOccurrenceOffset(
        baseEnd,
        schedule.recurrence.frequency,
        index,
      )
      return createOccurrence(schedule, index, occurrenceStart, occurrenceEnd)
    }

    if (schedule.recurrence.frequency === 'none') {
      return null
    }
    index += 1
  }
}
