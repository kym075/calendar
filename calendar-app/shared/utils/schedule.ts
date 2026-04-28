import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarMonths,
  endOfMonth,
  getDate,
  getDay,
  isValid,
  parse,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns'
import type {
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

function copyTime(source: Date, targetDay: Date): Date {
  // 日付だけを差し替え、時刻は元の予定と同じにする。
  const next = new Date(targetDay)
  next.setHours(
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds(),
  )
  return next
}

function getMonthlyWeekdayOccurrence(base: Date, occurrenceIndex: number): Date {
  // 「第2火曜」のように曜日基準で毎月繰り返す場合の発生日を求める。
  const targetMonthStart = startOfMonth(addMonths(base, occurrenceIndex))
  const baseWeekday = getDay(base)
  const weekIndex = Math.floor((getDate(base) - 1) / 7)
  const firstWeekdayOffset =
    (baseWeekday - getDay(targetMonthStart) + 7) % 7
  let targetDay = addDays(
    targetMonthStart,
    firstWeekdayOffset + weekIndex * 7,
  )

  if (targetDay.getMonth() !== targetMonthStart.getMonth()) {
    const targetMonthEnd = endOfMonth(targetMonthStart)
    const lastWeekdayOffset = (getDay(targetMonthEnd) - baseWeekday + 7) % 7
    targetDay = addDays(targetMonthEnd, -lastWeekdayOffset)
  }

  return copyTime(base, targetDay)
}

function addOccurrenceOffset(
  base: Date,
  recurrence: ScheduleRecurrence,
  occurrenceIndex: number,
): Date {
  switch (recurrence.frequency) {
    case 'daily':
      return addDays(base, occurrenceIndex)
    case 'weekly':
      return addWeeks(base, occurrenceIndex)
    case 'monthly':
      if (recurrence.monthlyMode === 'weekday') {
        return getMonthlyWeekdayOccurrence(base, occurrenceIndex)
      }
      return addMonths(base, occurrenceIndex)
    case 'none':
      return base
    default:
      return base
  }
}

function addOccurrenceEndOffset(
  baseStart: Date,
  baseEnd: Date,
  recurrence: ScheduleRecurrence,
  occurrenceIndex: number,
  occurrenceStart: Date,
): Date {
  if (recurrence.frequency === 'monthly' && recurrence.monthlyMode === 'weekday') {
    return new Date(
      occurrenceStart.getTime() + baseEnd.getTime() - baseStart.getTime(),
    )
  }
  return addOccurrenceOffset(baseEnd, recurrence, occurrenceIndex)
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
  // 表示範囲より前の繰り返しを全部展開しないよう、開始候補の番号を先に進める。
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
  // 保存済みの1件の予定を、指定範囲内に出現する予定一覧へ展開する。
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
      schedule.recurrence,
      index,
    )
    if (!isOccurrenceAllowed(schedule.recurrence, occurrenceStart, index)) {
      break
    }

    const occurrenceEnd = addOccurrenceEndOffset(
      baseStart,
      baseEnd,
      schedule.recurrence,
      index,
      occurrenceStart,
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
  // 通知用に「指定時刻以降で次に始まる予定」を1件だけ探す。
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
      schedule.recurrence,
      index,
    )
    if (!isOccurrenceAllowed(schedule.recurrence, occurrenceStart, index)) {
      return null
    }

    if (occurrenceStart.getTime() >= thresholdMs) {
      const occurrenceEnd = addOccurrenceEndOffset(
        baseStart,
        baseEnd,
        schedule.recurrence,
        index,
        occurrenceStart,
      )
      return createOccurrence(schedule, index, occurrenceStart, occurrenceEnd)
    }

    if (schedule.recurrence.frequency === 'none') {
      return null
    }
    index += 1
  }
}
