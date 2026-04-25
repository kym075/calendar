import electron from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  addDays,
  format,
  isBefore,
  isValid,
  parse,
  parseISO,
  startOfDay,
} from 'date-fns'
import { ipcChannels } from '../shared/types/ipc'
import {
  isColorTheme,
  defaultAppSettings,
  isCalendarViewMode,
  isNotificationLeadMinutes,
  isWeatherRegion,
  type AppSettings,
  type AppSettingsInput,
  type NotificationLeadMinutes,
  type WeatherRegion,
} from '../shared/types/settings'
import {
  defaultScheduleRecurrence,
  isRecurrenceEndMode,
  isRecurrenceFrequency,
  recurrenceCountMax,
  recurrenceCountMin,
  scheduleColors,
  scheduleMemoMaxLength,
  scheduleTitleMaxLength,
  type ScheduleRecurrence,
  type Schedule,
  type ScheduleColor,
  type ScheduleId,
  type ScheduleOccurrence,
  type ScheduleInput,
} from '../shared/types/schedule'
import {
  findNextOccurrenceStartingAfter,
  sortSchedules,
} from '../shared/utils/schedule'
import type { DailyWeather, WeatherRangeInput } from '../shared/types/weather'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MINUTE_MS = 60 * 1000
const MAX_SET_TIMEOUT_MS = 2_147_483_647
const STARTUP_ARG = '--startup'
const APP_DISPLAY_NAME = 'Toki'
interface WeatherLocation {
  latitude: number
  longitude: number
  timezone: string
}

const WEATHER_LOCATIONS: Record<WeatherRegion, WeatherLocation> = {
  nagoya: { latitude: 35.18147, longitude: 136.90641, timezone: 'Asia/Tokyo' },
  tokyo: { latitude: 35.681236, longitude: 139.767125, timezone: 'Asia/Tokyo' },
  osaka: { latitude: 34.702485, longitude: 135.495951, timezone: 'Asia/Tokyo' },
  sapporo: { latitude: 43.068661, longitude: 141.350755, timezone: 'Asia/Tokyo' },
  fukuoka: { latitude: 33.590355, longitude: 130.401716, timezone: 'Asia/Tokyo' },
}
const WEATHER_CACHE_MS = 15 * MINUTE_MS
const WEATHER_REQUEST_TIMEOUT_MS = 10_000
const WEATHER_FORECAST_MAX_DAYS = 16
const { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, Tray } =
  electron

const colorSet = new Set<ScheduleColor>(scheduleColors)
const isStartupLaunch = process.argv.includes(STARTUP_ARG)

let mainWindow: InstanceType<typeof BrowserWindow> | null = null
let tray: InstanceType<typeof Tray> | null = null
let appQuitting = false
let schedules: Schedule[] = []
let appSettings: AppSettings = defaultAppSettings
const notificationTimers = new Map<ScheduleId, NodeJS.Timeout>()
const weatherRangeCache = new Map<
  string,
  { expiresAt: number; items: DailyWeather[] }
>()

function getScheduleFilePath(): string {
  return join(app.getPath('userData'), 'schedules.json')
}

function getSettingsFilePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

async function ensureScheduleFile(): Promise<void> {
  const filePath = getScheduleFilePath()
  await mkdir(dirname(filePath), { recursive: true })
  if (!existsSync(filePath)) {
    await writeFile(filePath, '[]', 'utf-8')
  }
}

async function ensureSettingsFile(): Promise<void> {
  const filePath = getSettingsFilePath()
  await mkdir(dirname(filePath), { recursive: true })
  if (!existsSync(filePath)) {
    await writeFile(filePath, JSON.stringify(defaultAppSettings, null, 2), 'utf-8')
  }
}

function isScheduleColor(value: unknown): value is ScheduleColor {
  return typeof value === 'string' && colorSet.has(value as ScheduleColor)
}

function normalizeScheduleColor(value: unknown): ScheduleColor | null {
  // Backward compatibility: previously saved "slate" is mapped to yellow.
  if (value === 'slate') {
    return 'yellow'
  }
  return isScheduleColor(value) ? value : null
}

function normalizeSettingsRecord(value: unknown): AppSettings {
  if (typeof value !== 'object' || value === null) {
    return defaultAppSettings
  }

  const record = value as Record<string, unknown>
  return {
    notificationLeadMinutes: isNotificationLeadMinutes(record.notificationLeadMinutes)
      ? record.notificationLeadMinutes
      : defaultAppSettings.notificationLeadMinutes,
    preferredViewMode: isCalendarViewMode(record.preferredViewMode)
      ? record.preferredViewMode
      : defaultAppSettings.preferredViewMode,
    colorTheme: isColorTheme(record.colorTheme)
      ? record.colorTheme
      : defaultAppSettings.colorTheme,
    weatherRegion: isWeatherRegion(record.weatherRegion)
      ? record.weatherRegion
      : defaultAppSettings.weatherRegion,
  }
}

function mergeSettings(input: AppSettingsInput): AppSettings {
  const nextLeadMinutes = input.notificationLeadMinutes
  const nextViewMode = input.preferredViewMode
  const nextColorTheme = input.colorTheme
  const nextWeatherRegion = input.weatherRegion

  if (
    nextLeadMinutes !== undefined &&
    !isNotificationLeadMinutes(nextLeadMinutes)
  ) {
    throw new Error('通知タイミングの設定が不正です。')
  }
  if (nextViewMode !== undefined && !isCalendarViewMode(nextViewMode)) {
    throw new Error('表示モードの設定が不正です。')
  }
  if (nextColorTheme !== undefined && !isColorTheme(nextColorTheme)) {
    throw new Error('テーマの設定が不正です。')
  }
  if (nextWeatherRegion !== undefined && !isWeatherRegion(nextWeatherRegion)) {
    throw new Error('地域の設定が不正です。')
  }

  return {
    notificationLeadMinutes:
      nextLeadMinutes ?? appSettings.notificationLeadMinutes,
    preferredViewMode: nextViewMode ?? appSettings.preferredViewMode,
    colorTheme: nextColorTheme ?? appSettings.colorTheme,
    weatherRegion: nextWeatherRegion ?? appSettings.weatherRegion,
  }
}

function getNotificationLeadMs(): number {
  return appSettings.notificationLeadMinutes * MINUTE_MS
}

function formatLeadLabel(minutes: NotificationLeadMinutes): string {
  if (minutes === 24 * 60) {
    return '1日前'
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}時間前`
  }
  return `${minutes}分前`
}

function parseDateInput(value: string): Date | null {
  const parsed = parse(value, 'yyyy-MM-dd', new Date())
  return isValid(parsed) ? startOfDay(parsed) : null
}

function normalizeRecurrenceInput(value: unknown): ScheduleRecurrence {
  if (typeof value !== 'object' || value === null) {
    return defaultScheduleRecurrence
  }

  const record = value as Record<string, unknown>
  if (!isRecurrenceFrequency(record.frequency)) {
    return defaultScheduleRecurrence
  }
  if (record.frequency === 'none') {
    return defaultScheduleRecurrence
  }

  const endMode = isRecurrenceEndMode(record.endMode) ? record.endMode : 'never'
  const untilDate = typeof record.untilDate === 'string' ? record.untilDate : null
  const count = Number.isInteger(record.count) ? Number(record.count) : null

  if (endMode === 'onDate') {
    return {
      frequency: record.frequency,
      endMode,
      untilDate,
      count: null,
    }
  }

  if (endMode === 'afterCount') {
    return {
      frequency: record.frequency,
      endMode,
      untilDate: null,
      count,
    }
  }

  return {
    frequency: record.frequency,
    endMode: 'never',
    untilDate: null,
    count: null,
  }
}

function validateRecurrenceInput(
  recurrence: ScheduleRecurrence,
  startAt: Date,
): ScheduleRecurrence {
  if (recurrence.frequency === 'none') {
    return defaultScheduleRecurrence
  }

  if (recurrence.endMode === 'onDate') {
    if (!recurrence.untilDate) {
      throw new Error('繰り返しの終了日を入力してください。')
    }
    const untilDay = parseDateInput(recurrence.untilDate)
    if (!untilDay) {
      throw new Error('繰り返しの終了日が不正です。')
    }
    if (isBefore(untilDay, startOfDay(startAt))) {
      throw new Error('繰り返しの終了日は開始日以降にしてください。')
    }
    return {
      frequency: recurrence.frequency,
      endMode: 'onDate',
      untilDate: recurrence.untilDate,
      count: null,
    }
  }

  if (recurrence.endMode === 'afterCount') {
    if (
      recurrence.count === null ||
      !Number.isInteger(recurrence.count) ||
      recurrence.count < recurrenceCountMin ||
      recurrence.count > recurrenceCountMax
    ) {
      throw new Error(
        `繰り返し回数は${recurrenceCountMin}〜${recurrenceCountMax}で入力してください。`,
      )
    }
    return {
      frequency: recurrence.frequency,
      endMode: 'afterCount',
      untilDate: null,
      count: recurrence.count,
    }
  }

  return {
    frequency: recurrence.frequency,
    endMode: 'never',
    untilDate: null,
    count: null,
  }
}

function toSchedule(value: unknown): Schedule | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const record = value as Record<string, unknown>
  const normalizedColor = normalizeScheduleColor(record.color)
  if (
    typeof record.id !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.startAt !== 'string' ||
    typeof record.endAt !== 'string' ||
    typeof record.memo !== 'string' ||
    !normalizedColor ||
    typeof record.createdAt !== 'string' ||
    typeof record.updatedAt !== 'string'
  ) {
    return null
  }

  const parsedStartAt = parseISO(record.startAt)
  const normalizedRecurrence = normalizeRecurrenceInput(record.recurrence)
  const recurrence =
    isValid(parsedStartAt)
      ? (() => {
          try {
            return validateRecurrenceInput(normalizedRecurrence, parsedStartAt)
          } catch {
            return defaultScheduleRecurrence
          }
        })()
      : defaultScheduleRecurrence

  return {
    id: record.id,
    title: record.title,
    startAt: record.startAt,
    endAt: record.endAt,
    allDay: typeof record.allDay === 'boolean' ? record.allDay : false,
    memo: record.memo,
    color: normalizedColor,
    recurrence,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

async function loadSchedulesFromDisk(): Promise<Schedule[]> {
  await ensureScheduleFile()
  const filePath = getScheduleFilePath()
  const text = await readFile(filePath, 'utf-8')

  try {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) {
      return []
    }

    const normalized: Schedule[] = []
    for (const item of parsed) {
      const schedule = toSchedule(item)
      if (schedule) {
        normalized.push(schedule)
      }
    }
    return sortSchedules(normalized)
  } catch {
    return []
  }
}

async function loadSettingsFromDisk(): Promise<AppSettings> {
  await ensureSettingsFile()
  const filePath = getSettingsFilePath()
  const text = await readFile(filePath, 'utf-8')

  try {
    const parsed: unknown = JSON.parse(text)
    return normalizeSettingsRecord(parsed)
  } catch {
    return defaultAppSettings
  }
}

async function saveSchedulesToDisk(items: Schedule[]): Promise<void> {
  const filePath = getScheduleFilePath()
  await writeFile(filePath, JSON.stringify(sortSchedules(items), null, 2), 'utf-8')
}

async function saveSettingsToDisk(settings: AppSettings): Promise<void> {
  const filePath = getSettingsFilePath()
  await writeFile(filePath, JSON.stringify(settings, null, 2), 'utf-8')
}

function validateScheduleInput(input: ScheduleInput): {
  recurrence: ScheduleRecurrence
  color: ScheduleColor
} {
  const normalizedTitle = input.title.trim()
  const normalizedMemo = input.memo.trim()
  const normalizedColor = normalizeScheduleColor(input.color)

  if (typeof input.allDay !== 'boolean') {
    throw new Error('終日フラグが不正です。')
  }
  if (normalizedTitle.length === 0) {
    throw new Error('タイトルは必須です。')
  }
  if (normalizedTitle.length > scheduleTitleMaxLength) {
    throw new Error(`タイトルは${scheduleTitleMaxLength}文字以内で入力してください。`)
  }
  if (normalizedMemo.length > scheduleMemoMaxLength) {
    throw new Error(`メモは${scheduleMemoMaxLength}文字以内で入力してください。`)
  }
  if (!normalizedColor) {
    throw new Error('カテゴリーカラーが不正です。')
  }

  const start = parseISO(input.startAt)
  const end = parseISO(input.endAt)
  if (!isValid(start) || !isValid(end)) {
    throw new Error('日付形式が不正です。')
  }
  if (start.getTime() >= end.getTime()) {
    throw new Error('開始時刻は終了時刻より前にしてください。')
  }

  const recurrenceInput = normalizeRecurrenceInput(input.recurrence)
  return {
    recurrence: validateRecurrenceInput(recurrenceInput, start),
    color: normalizedColor,
  }
}

function clearNotificationTimers(): void {
  for (const timeout of notificationTimers.values()) {
    clearTimeout(timeout)
  }
  notificationTimers.clear()
}

function showNotification(occurrence: Pick<ScheduleOccurrence, 'title' | 'startAt'>): void {
  if (!Notification.isSupported()) {
    return
  }

  const start = parseISO(occurrence.startAt)
  if (!isValid(start)) {
    return
  }

  const startLabel = format(start, 'HH:mm')
  new Notification({
    title: `予定の${formatLeadLabel(appSettings.notificationLeadMinutes)}です`,
    body: `${occurrence.title} (${startLabel}開始)`,
  }).show()
}

function scheduleNextNotificationForSchedule(scheduleId: ScheduleId): void {
  const latest = schedules.find((item) => item.id === scheduleId)
  if (!latest) {
    notificationTimers.delete(scheduleId)
    return
  }

  const leadMs = getNotificationLeadMs()
  const threshold = new Date(Date.now() + leadMs)
  const nextOccurrence = findNextOccurrenceStartingAfter(latest, threshold)
  if (!nextOccurrence) {
    notificationTimers.delete(scheduleId)
    return
  }

  const nextStart = parseISO(nextOccurrence.startAt)
  if (!isValid(nextStart)) {
    notificationTimers.delete(scheduleId)
    return
  }

  armNotificationTimer(nextOccurrence, nextStart.getTime() - leadMs)
}

function armNotificationTimer(
  occurrence: ScheduleOccurrence,
  notifyAtMs: number,
): void {
  const remainingMs = notifyAtMs - Date.now()
  if (remainingMs <= 0) {
    showNotification(occurrence)
    scheduleNextNotificationForSchedule(occurrence.scheduleId)
    return
  }

  // setTimeout は約24.8日を超える待機時間を扱えないため分割して待機する。
  const nextDelay = Math.min(remainingMs, MAX_SET_TIMEOUT_MS)
  const timeout = setTimeout(() => {
    if (nextDelay < remainingMs) {
      armNotificationTimer(occurrence, notifyAtMs)
      return
    }
    showNotification(occurrence)
    scheduleNextNotificationForSchedule(occurrence.scheduleId)
  }, nextDelay)

  notificationTimers.set(occurrence.scheduleId, timeout)
}

function scheduleUpcomingNotifications(): void {
  clearNotificationTimers()
  const leadMs = getNotificationLeadMs()
  const threshold = new Date(Date.now() + leadMs)

  for (const schedule of schedules) {
    const nextOccurrence = findNextOccurrenceStartingAfter(schedule, threshold)
    if (!nextOccurrence) {
      continue
    }
    const start = parseISO(nextOccurrence.startAt)
    if (!isValid(start)) {
      continue
    }
    armNotificationTimer(nextOccurrence, start.getTime() - leadMs)
  }
}

function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function getCurrentWeatherLocation(): WeatherLocation {
  return WEATHER_LOCATIONS[appSettings.weatherRegion]
}

function getWeatherLabels(weatherCode: number): {
  weatherLabel: string
  weatherShortLabel: string
} {
  if (weatherCode === 0) {
    return { weatherLabel: '☀️', weatherShortLabel: '☀️' }
  }
  if (weatherCode === 1) {
    return { weatherLabel: '🌤️', weatherShortLabel: '🌤️' }
  }
  if (weatherCode === 2) {
    return { weatherLabel: '⛅', weatherShortLabel: '⛅' }
  }
  if (weatherCode === 3) {
    return { weatherLabel: '☁️', weatherShortLabel: '☁️' }
  }
  if (weatherCode === 45 || weatherCode === 48) {
    return { weatherLabel: '🌫️', weatherShortLabel: '🌫️' }
  }
  if ([51, 53, 55, 56, 57].includes(weatherCode)) {
    return { weatherLabel: '🌦️', weatherShortLabel: '🌦️' }
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
    return { weatherLabel: '🌧️', weatherShortLabel: '🌧️' }
  }
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    return { weatherLabel: '🌨️', weatherShortLabel: '🌨️' }
  }
  if ([95, 96, 99].includes(weatherCode)) {
    return { weatherLabel: '⛈️', weatherShortLabel: '⛈️' }
  }
  return { weatherLabel: '🌈', weatherShortLabel: '🌈' }
}

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WEATHER_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(
        `天気APIの取得に失敗しました。(status: ${response.status})`,
      )
    }
    return response.json()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('天気APIの取得がタイムアウトしました。')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function toDailyWeatherList(value: unknown): DailyWeather[] {
  if (typeof value !== 'object' || value === null) {
    return []
  }

  const record = value as Record<string, unknown>
  if (typeof record.daily !== 'object' || record.daily === null) {
    return []
  }

  const daily = record.daily as Record<string, unknown>
  const dateList = Array.isArray(daily.time) ? daily.time : []
  const weatherCodeList = Array.isArray(daily.weather_code) ? daily.weather_code : []
  const maxTempList = Array.isArray(daily.temperature_2m_max)
    ? daily.temperature_2m_max
    : []
  const minTempList = Array.isArray(daily.temperature_2m_min)
    ? daily.temperature_2m_min
    : []

  const items: DailyWeather[] = []
  for (let index = 0; index < dateList.length; index += 1) {
    const date = dateList[index]
    if (typeof date !== 'string') {
      continue
    }

    const weatherCodeCandidate = weatherCodeList[index]
    const weatherCode =
      typeof weatherCodeCandidate === 'number' &&
      Number.isFinite(weatherCodeCandidate)
        ? Math.trunc(weatherCodeCandidate)
        : -1
    const maxTempCandidate = maxTempList[index]
    const minTempCandidate = minTempList[index]
    const temperatureMaxC =
      typeof maxTempCandidate === 'number' && Number.isFinite(maxTempCandidate)
        ? Math.round(maxTempCandidate)
        : null
    const temperatureMinC =
      typeof minTempCandidate === 'number' && Number.isFinite(minTempCandidate)
        ? Math.round(minTempCandidate)
        : null
    const { weatherLabel, weatherShortLabel } = getWeatherLabels(weatherCode)

    items.push({
      date,
      weatherCode,
      weatherLabel,
      weatherShortLabel,
      temperatureMaxC,
      temperatureMinC,
    })
  }

  return items
}

async function fetchArchiveWeather(
  location: WeatherLocation,
  startDate: string,
  endDate: string,
): Promise<DailyWeather[]> {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive')
  url.searchParams.set('latitude', String(location.latitude))
  url.searchParams.set('longitude', String(location.longitude))
  url.searchParams.set('timezone', location.timezone)
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min',
  )
  url.searchParams.set('start_date', startDate)
  url.searchParams.set('end_date', endDate)

  const json = await fetchJsonWithTimeout(url.toString())
  return toDailyWeatherList(json)
}

async function fetchForecastWeather(
  location: WeatherLocation,
  startDate: string,
  endDate: string,
): Promise<DailyWeather[]> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(location.latitude))
  url.searchParams.set('longitude', String(location.longitude))
  url.searchParams.set('timezone', location.timezone)
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min',
  )
  url.searchParams.set('start_date', startDate)
  url.searchParams.set('end_date', endDate)

  const json = await fetchJsonWithTimeout(url.toString())
  return toDailyWeatherList(json)
}

async function listDailyWeatherByRange(
  input: WeatherRangeInput,
): Promise<DailyWeather[]> {
  const startDay = parseDateInput(input.startDate)
  const endDay = parseDateInput(input.endDate)
  if (!startDay || !endDay) {
    throw new Error('天気取得の日付形式が不正です。')
  }
  if (startDay.getTime() > endDay.getTime()) {
    throw new Error('天気取得の期間指定が不正です。')
  }

  const location = getCurrentWeatherLocation()
  const cacheKey = `${appSettings.weatherRegion}:${input.startDate}:${input.endDate}`
  const cached = weatherRangeCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.items
  }

  const segmentTasks: Promise<DailyWeather[]>[] = []
  const today = startOfDay(new Date())
  const yesterday = addDays(today, -1)
  const forecastLimit = addDays(today, WEATHER_FORECAST_MAX_DAYS - 1)

  if (startDay.getTime() <= yesterday.getTime()) {
    const pastEnd =
      endDay.getTime() <= yesterday.getTime() ? endDay : yesterday
    segmentTasks.push(
      fetchArchiveWeather(location, toDateKey(startDay), toDateKey(pastEnd)),
    )
  }

  if (endDay.getTime() >= today.getTime()) {
    const futureStart =
      startDay.getTime() >= today.getTime() ? startDay : today
    if (futureStart.getTime() <= forecastLimit.getTime()) {
      const futureEnd =
        endDay.getTime() <= forecastLimit.getTime() ? endDay : forecastLimit
      if (futureStart.getTime() <= futureEnd.getTime()) {
        segmentTasks.push(
          fetchForecastWeather(
            location,
            toDateKey(futureStart),
            toDateKey(futureEnd),
          ),
        )
      }
    }
  }

  if (segmentTasks.length === 0) {
    return []
  }

  const segmentResults = await Promise.all(segmentTasks)
  const byDate = new Map<string, DailyWeather>()
  for (const segment of segmentResults) {
    for (const item of segment) {
      if (item.date >= input.startDate && item.date <= input.endDate) {
        byDate.set(item.date, item)
      }
    }
  }

  const items = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  weatherRangeCache.set(cacheKey, {
    expiresAt: Date.now() + WEATHER_CACHE_MS,
    items,
  })
  return items
}

function configureAutoLaunch(): void {
  if (!app.isPackaged || process.platform !== 'win32') {
    return
  }

  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
    args: [STARTUP_ARG],
  })
}

function getPackagedAssetPath(...parts: string[]): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app.asar', ...parts)
  }
  return join(app.getAppPath(), ...parts)
}

async function upsertSchedule(input: ScheduleInput): Promise<Schedule[]> {
  const { recurrence, color } = validateScheduleInput(input)
  const nowIso = new Date().toISOString()

  const nextItem = {
    title: input.title.trim(),
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay,
    memo: input.memo.trim(),
    color,
    recurrence,
  }

  if (input.id) {
    const existing = schedules.find((item) => item.id === input.id)
    if (existing) {
      const updated: Schedule = {
        ...existing,
        ...nextItem,
        updatedAt: nowIso,
      }
      schedules = schedules.map((item) => (item.id === input.id ? updated : item))
    } else {
      schedules = [
        ...schedules,
        {
          id: input.id,
          ...nextItem,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ]
    }
  } else {
    schedules = [
      ...schedules,
      {
        id: randomUUID(),
        ...nextItem,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ]
  }

  schedules = sortSchedules(schedules)
  await saveSchedulesToDisk(schedules)
  scheduleUpcomingNotifications()
  return schedules
}

async function removeSchedule(id: ScheduleId): Promise<Schedule[]> {
  schedules = schedules.filter((item) => item.id !== id)
  await saveSchedulesToDisk(schedules)
  scheduleUpcomingNotifications()
  return schedules
}

async function updateSettings(input: AppSettingsInput): Promise<AppSettings> {
  const nextSettings = mergeSettings(input)
  const weatherRegionChanged =
    nextSettings.weatherRegion !== appSettings.weatherRegion
  appSettings = nextSettings
  await saveSettingsToDisk(nextSettings)
  if (weatherRegionChanged) {
    weatherRangeCache.clear()
  }
  scheduleUpcomingNotifications()
  return nextSettings
}

function createWindow(): InstanceType<typeof BrowserWindow> {
  const windowIconPath = getPackagedAssetPath('build', 'icon.png')
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 840,
    minHeight: 620,
    show: false,
    icon: windowIconPath,
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => {
    if (!isStartupLaunch) {
      win.show()
    }
  })
  win.setMenuBarVisibility(false)

  win.on('close', (event) => {
    if (!appQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../dist/index.html'))
  }

  return win
}

function createTray(): void {
  if (tray) {
    return
  }

  const fallbackIcon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAIAAACQKrqGAAAAKUlEQVR4nGNkYGD4z0AEYBxVSFJgqJQwajA0mEqYGSQxQDRA1GBoAAB2kwQVcC+hFgAAAABJRU5ErkJggg==',
  )
  const trayIconPath = getPackagedAssetPath('build', 'icon.png')
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  const icon = trayIcon.isEmpty()
    ? fallbackIcon
    : trayIcon.resize({ width: 16, height: 16 })

  tray = new Tray(icon)
  tray.setToolTip(APP_DISPLAY_NAME)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '表示',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        },
      },
      {
        label: '終了',
        click: () => {
          appQuitting = true
          app.quit()
        },
      },
    ]),
  )

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle(ipcChannels.schedules.list, async () => schedules)
  ipcMain.handle(
    ipcChannels.schedules.upsert,
    async (_event, input: ScheduleInput) => upsertSchedule(input),
  )
  ipcMain.handle(
    ipcChannels.schedules.remove,
    async (_event, id: ScheduleId) => removeSchedule(id),
  )
  ipcMain.handle(ipcChannels.settings.get, async () => appSettings)
  ipcMain.handle(
    ipcChannels.settings.update,
    async (_event, input: AppSettingsInput) => updateSettings(input),
  )
  ipcMain.handle(
    ipcChannels.weather.byRange,
    async (_event, input: WeatherRangeInput) => listDailyWeatherByRange(input),
  )
}

app.on('before-quit', () => {
  appQuitting = true
  clearNotificationTimers()
})

app.on('window-all-closed', () => {
  if (appQuitting) {
    return
  }
  // トレイ常駐のため、ウィンドウがなくてもアプリを終了しない。
})

app.whenReady().then(async () => {
  app.setName(APP_DISPLAY_NAME)
  appSettings = await loadSettingsFromDisk()
  schedules = await loadSchedulesFromDisk()
  scheduleUpcomingNotifications()
  configureAutoLaunch()

  Menu.setApplicationMenu(null)
  registerIpcHandlers()
  mainWindow = createWindow()
  createTray()

  app.on('activate', () => {
    if (mainWindow === null) {
      mainWindow = createWindow()
      return
    }
    mainWindow.show()
    mainWindow.focus()
  })
})
