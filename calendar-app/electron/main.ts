import electron from 'electron'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  addDays,
  differenceInCalendarDays,
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
  isRecurrenceMonthlyMode,
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

// 通知タイマーは Electron の main process で管理する。
const MAX_SET_TIMEOUT_MS = 2_147_483_647
const NOTIFICATION_MISSED_GRACE_MS = 5 * MINUTE_MS
const STARTUP_ARG = '--startup'
const APP_DISPLAY_NAME = 'Toki'
const APP_USER_MODEL_ID = 'com.personal.calendarapp'
const WINDOWS_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
interface WeatherLocation {
  latitude: number
  longitude: number
  timezone: string
}

// 天気APIへ渡す地域情報。UIの地域選択と同じキーで管理する。
const WEATHER_LOCATIONS: Record<WeatherRegion, WeatherLocation> = {
  nagoya: { latitude: 35.18147, longitude: 136.90641, timezone: 'Asia/Tokyo' },
  tokyo: { latitude: 35.681236, longitude: 139.767125, timezone: 'Asia/Tokyo' },
  osaka: { latitude: 34.702485, longitude: 135.495951, timezone: 'Asia/Tokyo' },
  sapporo: { latitude: 43.068661, longitude: 141.350755, timezone: 'Asia/Tokyo' },
  fukuoka: { latitude: 33.590355, longitude: 130.401716, timezone: 'Asia/Tokyo' },
}
const WEATHER_CACHE_MS = 15 * MINUTE_MS
const WEATHER_REQUEST_TIMEOUT_MS = 15_000
const WEATHER_REQUEST_MAX_ATTEMPTS = 2
const WEATHER_FORECAST_MAX_DAYS = 16
const WEATHER_RANGE_MAX_DAYS = 370
const { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, Tray } =
  electron

const colorSet = new Set<ScheduleColor>(scheduleColors)
const isStartupLaunch = process.argv.includes(STARTUP_ARG)

// 二重起動を防ぎ、2回目の起動では既存ウィンドウを前面に出す。
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID)
}

if (!hasSingleInstanceLock) {
  app.quit()
}

let mainWindow: InstanceType<typeof BrowserWindow> | null = null
let tray: InstanceType<typeof Tray> | null = null
let appQuitting = false

// ファイルから読み込んだデータを、起動中はメモリに保持しておく。
let schedules: Schedule[] = []
let appSettings: AppSettings = defaultAppSettings

// 通知と天気は外部状態を持つため、重複実行しないよう Map/Set で管理する。
const notificationTimers = new Map<ScheduleId, NodeJS.Timeout>()
const shownNotificationKeys = new Set<string>()
const weatherRangeCache = new Map<
  string,
  { expiresAt: number; items: DailyWeather[] }
>()
const weatherRangeRequests = new Map<string, Promise<DailyWeather[]>>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getScheduleFilePath(): string {
  return join(app.getPath('userData'), 'schedules.json')
}

function getSettingsFilePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

async function ensureScheduleFile(): Promise<void> {
  // 初回起動時は保存先フォルダと空のJSONファイルを作る。
  const filePath = getScheduleFilePath()
  await mkdir(dirname(filePath), { recursive: true })
  if (!existsSync(filePath)) {
    await writeFile(filePath, '[]', 'utf-8')
  }
}

async function ensureSettingsFile(): Promise<void> {
  // 設定ファイルも初回起動時だけ既定値で作成する。
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
  // 以前保存していた "slate" は現在の色候補にないため、yellowへ置き換える。
  if (value === 'slate') {
    return 'yellow'
  }
  return isScheduleColor(value) ? value : null
}

function normalizeSettingsRecord(value: unknown): AppSettings {
  // 保存済みJSONが壊れていても、アプリが落ちないよう既定値へ戻す。
  if (!isRecord(value)) {
    return defaultAppSettings
  }

  return {
    notificationLeadMinutes: isNotificationLeadMinutes(value.notificationLeadMinutes)
      ? value.notificationLeadMinutes
      : defaultAppSettings.notificationLeadMinutes,
    preferredViewMode: isCalendarViewMode(value.preferredViewMode)
      ? value.preferredViewMode
      : defaultAppSettings.preferredViewMode,
    colorTheme: isColorTheme(value.colorTheme)
      ? value.colorTheme
      : defaultAppSettings.colorTheme,
    weatherRegion: isWeatherRegion(value.weatherRegion)
      ? value.weatherRegion
      : defaultAppSettings.weatherRegion,
    startupLaunchEnabled:
      typeof value.startupLaunchEnabled === 'boolean'
        ? value.startupLaunchEnabled
        : defaultAppSettings.startupLaunchEnabled,
  }
}

function mergeSettings(input: AppSettingsInput): AppSettings {
  // 部分更新を受け取り、指定されなかった項目は現在の設定を引き継ぐ。
  if (!isRecord(input)) {
    throw new Error('設定入力が不正です。')
  }

  const nextLeadMinutes = input.notificationLeadMinutes
  const nextViewMode = input.preferredViewMode
  const nextColorTheme = input.colorTheme
  const nextWeatherRegion = input.weatherRegion
  const nextStartupLaunchEnabled = input.startupLaunchEnabled

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
  if (
    nextStartupLaunchEnabled !== undefined &&
    typeof nextStartupLaunchEnabled !== 'boolean'
  ) {
    throw new Error('自動起動の設定が不正です。')
  }

  return {
    notificationLeadMinutes:
      nextLeadMinutes ?? appSettings.notificationLeadMinutes,
    preferredViewMode: nextViewMode ?? appSettings.preferredViewMode,
    colorTheme: nextColorTheme ?? appSettings.colorTheme,
    weatherRegion: nextWeatherRegion ?? appSettings.weatherRegion,
    startupLaunchEnabled:
      nextStartupLaunchEnabled ?? appSettings.startupLaunchEnabled,
  }
}

function getNotificationLeadMs(): number {
  return appSettings.notificationLeadMinutes * MINUTE_MS
}

function formatLeadLabel(minutes: NotificationLeadMinutes): string {
  if (minutes % (24 * 60) === 0) {
    return `${minutes / (24 * 60)}日前`
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
  // 保存済みデータやIPC入力は unknown として扱い、使える形に整える。
  if (!isRecord(value)) {
    return defaultScheduleRecurrence
  }

  if (!isRecurrenceFrequency(value.frequency)) {
    return defaultScheduleRecurrence
  }
  if (value.frequency === 'none') {
    return defaultScheduleRecurrence
  }

  const endMode = isRecurrenceEndMode(value.endMode) ? value.endMode : 'never'
  const monthlyMode =
    value.frequency === 'monthly' && isRecurrenceMonthlyMode(value.monthlyMode)
      ? value.monthlyMode
      : value.frequency === 'monthly'
        ? 'date'
        : null
  const untilDate = typeof value.untilDate === 'string' ? value.untilDate : null
  const count = Number.isInteger(value.count) ? Number(value.count) : null

  if (endMode === 'onDate') {
    return {
      frequency: value.frequency,
      monthlyMode,
      endMode,
      untilDate,
      count: null,
    }
  }

  if (endMode === 'afterCount') {
    return {
      frequency: value.frequency,
      monthlyMode,
      endMode,
      untilDate: null,
      count,
    }
  }

  return {
    frequency: value.frequency,
    monthlyMode,
    endMode: 'never',
    untilDate: null,
    count: null,
  }
}

function validateRecurrenceInput(
  recurrence: ScheduleRecurrence,
  startAt: Date,
): ScheduleRecurrence {
  // 繰り返し設定は保存前に終了日・回数の矛盾をチェックする。
  if (recurrence.frequency === 'none') {
    return defaultScheduleRecurrence
  }
  const monthlyMode =
    recurrence.frequency === 'monthly' ? recurrence.monthlyMode ?? 'date' : null

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
      monthlyMode,
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
      monthlyMode,
      endMode: 'afterCount',
      untilDate: null,
      count: recurrence.count,
    }
  }

  return {
    frequency: recurrence.frequency,
    monthlyMode,
    endMode: 'never',
    untilDate: null,
    count: null,
  }
}

function toSchedule(value: unknown): Schedule | null {
  // ファイルから読んだ値は信用せず、必要な項目が揃うものだけ予定として扱う。
  if (!isRecord(value)) {
    return null
  }

  const normalizedColor = normalizeScheduleColor(value.color)
  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.startAt !== 'string' ||
    typeof value.endAt !== 'string' ||
    typeof value.memo !== 'string' ||
    !normalizedColor ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null
  }

  const parsedStartAt = parseISO(value.startAt)
  const normalizedRecurrence = normalizeRecurrenceInput(value.recurrence)
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
    id: value.id,
    title: value.title,
    startAt: value.startAt,
    endAt: value.endAt,
    allDay: typeof value.allDay === 'boolean' ? value.allDay : false,
    memo: value.memo,
    color: normalizedColor,
    recurrence,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

async function loadSchedulesFromDisk(): Promise<Schedule[]> {
  // 壊れた予定データは読み飛ばし、アプリ起動を優先する。
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
  // 設定ファイルが壊れている場合は既定値で起動する。
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
  // 保存時も並び順をそろえ、JSONを読みやすい形で書き出す。
  const filePath = getScheduleFilePath()
  await writeFile(filePath, JSON.stringify(sortSchedules(items), null, 2), 'utf-8')
}

async function saveSettingsToDisk(settings: AppSettings): Promise<void> {
  // 設定は1オブジェクトだけなので、そのままJSONへ保存する。
  const filePath = getSettingsFilePath()
  await writeFile(filePath, JSON.stringify(settings, null, 2), 'utf-8')
}

function validateScheduleInput(input: ScheduleInput): {
  id: ScheduleId | null
  item: {
    title: string
    startAt: string
    endAt: string
    allDay: boolean
    memo: string
    color: ScheduleColor
    recurrence: ScheduleRecurrence
  }
} {
  // renderer から来た値も実行時に検証してから保存する。
  if (!isRecord(input)) {
    throw new Error('予定入力が不正です。')
  }

  const id =
    input.id === undefined
      ? null
      : typeof input.id === 'string' && input.id.length > 0
        ? input.id
        : null

  if (input.id !== undefined && id === null) {
    throw new Error('予定IDが不正です。')
  }
  if (typeof input.title !== 'string') {
    throw new Error('タイトルが不正です。')
  }
  if (typeof input.memo !== 'string') {
    throw new Error('メモが不正です。')
  }
  if (typeof input.startAt !== 'string' || typeof input.endAt !== 'string') {
    throw new Error('日付形式が不正です。')
  }
  if (typeof input.allDay !== 'boolean') {
    throw new Error('終日フラグが不正です。')
  }

  const normalizedTitle = input.title.trim()
  const normalizedMemo = input.memo.trim()
  const normalizedColor = normalizeScheduleColor(input.color)

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
    id,
    item: {
      title: normalizedTitle,
      startAt: input.startAt,
      endAt: input.endAt,
      allDay: input.allDay,
      memo: normalizedMemo,
      color: normalizedColor,
      recurrence: validateRecurrenceInput(recurrenceInput, start),
    },
  }
}

function clearNotificationTimers(): void {
  // 予定や通知設定が変わったら、古い通知予約をすべて作り直す。
  for (const timeout of notificationTimers.values()) {
    clearTimeout(timeout)
  }
  notificationTimers.clear()
}

function getNotificationKey(
  occurrence: Pick<ScheduleOccurrence, 'scheduleId' | 'occurrenceIndex' | 'startAt'>,
): string {
  return `${occurrence.scheduleId}:${occurrence.occurrenceIndex}:${occurrence.startAt}`
}

function showNotification(occurrence: ScheduleOccurrence): void {
  // 同じ予定の同じ回に対して、通知を二重表示しない。
  const key = getNotificationKey(occurrence)
  if (shownNotificationKeys.has(key)) {
    return
  }
  if (!Notification.isSupported()) {
    return
  }

  const start = parseISO(occurrence.startAt)
  if (!isValid(start)) {
    return
  }

  const startLabel = format(start, 'HH:mm')
  shownNotificationKeys.add(key)
  new Notification({
    title: `予定の${formatLeadLabel(appSettings.notificationLeadMinutes)}です`,
    body: `${occurrence.title} (${startLabel}開始)`,
  }).show()
}

function scheduleNextNotificationForSchedule(
  scheduleId: ScheduleId,
  threshold = new Date(Date.now() - NOTIFICATION_MISSED_GRACE_MS),
): void {
  // 通知後は同じ予定の次回発生分だけを探して、次のタイマーを張る。
  const latest = schedules.find((item) => item.id === scheduleId)
  if (!latest) {
    notificationTimers.delete(scheduleId)
    return
  }

  const leadMs = getNotificationLeadMs()
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
  // 実際に通知を出す時刻まで待ち、通知後に次回分を予約する。
  const nowMs = Date.now()
  const start = parseISO(occurrence.startAt)
  if (!isValid(start)) {
    return
  }

  const scheduleNextAfterThisOccurrence = (): void => {
    scheduleNextNotificationForSchedule(
      occurrence.scheduleId,
      new Date(start.getTime() + 1),
    )
  }

  const remainingMs = notifyAtMs - nowMs
  if (remainingMs <= 0) {
    if (
      start.getTime() <= nowMs &&
      nowMs - start.getTime() > NOTIFICATION_MISSED_GRACE_MS
    ) {
      scheduleNextAfterThisOccurrence()
      return
    }

    showNotification(occurrence)
    scheduleNextAfterThisOccurrence()
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
    scheduleNextAfterThisOccurrence()
  }, nextDelay)

  notificationTimers.set(occurrence.scheduleId, timeout)
}

function scheduleUpcomingNotifications(): void {
  // 起動時・予定変更時・通知設定変更時に、全予定の次回通知を再計算する。
  clearNotificationTimers()
  const threshold = new Date(Date.now() - NOTIFICATION_MISSED_GRACE_MS)

  for (const schedule of schedules) {
    const nextOccurrence = findNextOccurrenceStartingAfter(schedule, threshold)
    if (!nextOccurrence) {
      continue
    }
    const start = parseISO(nextOccurrence.startAt)
    if (!isValid(start)) {
      continue
    }
    const notifyAtMs = start.getTime() - getNotificationLeadMs()
    armNotificationTimer(nextOccurrence, notifyAtMs)
  }
}

function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function pruneExpiredWeatherCache(nowMs = Date.now()): void {
  // 期限切れキャッシュを削除し、長時間起動時に Map が増え続けるのを防ぐ。
  for (const [key, value] of weatherRangeCache) {
    if (value.expiresAt <= nowMs) {
      weatherRangeCache.delete(key)
    }
  }
}

function validateWeatherRangeInput(input: WeatherRangeInput): {
  startDate: string
  endDate: string
  startDay: Date
  endDay: Date
} {
  // renderer からの入力で広すぎる期間を要求されないよう制限する。
  if (!isRecord(input)) {
    throw new Error('天気取得の入力が不正です。')
  }
  if (typeof input.startDate !== 'string' || typeof input.endDate !== 'string') {
    throw new Error('天気取得の日付形式が不正です。')
  }

  const startDay = parseDateInput(input.startDate)
  const endDay = parseDateInput(input.endDate)
  if (!startDay || !endDay) {
    throw new Error('天気取得の日付形式が不正です。')
  }
  if (startDay.getTime() > endDay.getTime()) {
    throw new Error('天気取得の期間指定が不正です。')
  }
  if (differenceInCalendarDays(endDay, startDay) + 1 > WEATHER_RANGE_MAX_DAYS) {
    throw new Error(`天気取得は${WEATHER_RANGE_MAX_DAYS}日以内で指定してください。`)
  }

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    startDay,
    endDay,
  }
}

function getCurrentWeatherLocation(): WeatherLocation {
  return WEATHER_LOCATIONS[appSettings.weatherRegion]
}

function getWeatherLabels(weatherCode: number): {
  weatherLabel: string
  weatherShortLabel: string
} {
  // Open-Meteo の weather_code を、画面に出す短い表示へ変換する。
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
  // 外部APIが返ってこない場合でも、一定時間で処理を中断してリトライする。
  let lastError: unknown = null

  for (let attempt = 1; attempt <= WEATHER_REQUEST_MAX_ATTEMPTS; attempt += 1) {
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
      lastError =
        error instanceof Error && error.name === 'AbortError'
          ? new Error('天気APIの取得がタイムアウトしました。')
          : error
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError
}

function toDailyWeatherList(value: unknown): DailyWeather[] {
  // APIレスポンスの配列長や型が想定外でも、使える日付だけを取り出す。
  if (!isRecord(value)) {
    return []
  }

  if (!isRecord(value.daily)) {
    return []
  }

  const daily = value.daily
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

async function fetchForecastWeather(
  location: WeatherLocation,
  startDate: string,
  endDate: string,
): Promise<DailyWeather[]> {
  // 今日以降は forecast API から取得する。
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
  // UIが必要としている表示範囲だけを、キャッシュ込みで取得する入口。
  const { startDate, endDate, startDay, endDay } =
    validateWeatherRangeInput(input)

  const location = getCurrentWeatherLocation()
  const cacheKey = `${appSettings.weatherRegion}:${startDate}:${endDate}`
  pruneExpiredWeatherCache()

  const cached = weatherRangeCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.items
  }

  // 同じ範囲の取得が同時に来た場合は、同じ Promise を返してAPI通信を重複させない。
  const pending = weatherRangeRequests.get(cacheKey)
  if (pending) {
    return pending
  }

  const request = (async (): Promise<DailyWeather[]> => {
    const today = startOfDay(new Date())
    const forecastLimit = addDays(today, WEATHER_FORECAST_MAX_DAYS - 1)

    if (
      endDay.getTime() < today.getTime() ||
      startDay.getTime() > forecastLimit.getTime()
    ) {
      return []
    }

    const forecastStart =
      startDay.getTime() >= today.getTime() ? startDay : today
    const forecastEnd =
      endDay.getTime() <= forecastLimit.getTime() ? endDay : forecastLimit
    const forecastItems = await fetchForecastWeather(
      location,
      toDateKey(forecastStart),
      toDateKey(forecastEnd),
    )

    const byDate = new Map<string, DailyWeather>()
    for (const item of forecastItems) {
      if (item.date >= startDate && item.date <= endDate) {
        byDate.set(item.date, item)
      }
    }

    const items = [...byDate.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    )
    weatherRangeCache.set(cacheKey, {
      expiresAt: Date.now() + WEATHER_CACHE_MS,
      items,
    })
    return items
  })()

  weatherRangeRequests.set(cacheKey, request)
  try {
    return await request
  } finally {
    weatherRangeRequests.delete(cacheKey)
  }
}

function configureAutoLaunch(enabled: boolean): void {
  // 配布版のWindowsアプリだけ、設定に応じてログイン時起動を切り替える。
  if (!app.isPackaged || process.platform !== 'win32') {
    return
  }

  const startupArgs = enabled ? [STARTUP_ARG] : []
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: startupArgs,
  })

  configureWindowsRunKeyAutoLaunch(enabled, startupArgs)
}

function quoteWindowsCommandArg(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`
}

function configureWindowsRunKeyAutoLaunch(
  enabled: boolean,
  startupArgs: string[],
): void {
  const command = [
    quoteWindowsCommandArg(process.execPath),
    ...startupArgs,
  ].join(' ')
  const args = enabled
    ? [
        'add',
        WINDOWS_RUN_KEY,
        '/v',
        APP_DISPLAY_NAME,
        '/t',
        'REG_SZ',
        '/d',
        command,
        '/f',
      ]
    : ['delete', WINDOWS_RUN_KEY, '/v', APP_DISPLAY_NAME, '/f']

  spawnSync('reg.exe', args, {
    stdio: 'ignore',
    windowsHide: true,
  })
}

function getPackagedAssetPath(...parts: string[]): string {
  // 開発中と配布版で、アイコンなどの配置場所が違うため吸収する。
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app.asar', ...parts)
  }
  return join(app.getAppPath(), ...parts)
}

function getAppIconPath(): string {
  // Windowsのタスクバーは .ico の方が安定して反映される。
  return getPackagedAssetPath(
    'build',
    process.platform === 'win32' ? 'icon.ico' : 'icon.png',
  )
}

async function upsertSchedule(input: ScheduleInput): Promise<Schedule[]> {
  // id があれば更新、なければ新規作成として保存する。
  const { id, item: nextItem } = validateScheduleInput(input)
  const nowIso = new Date().toISOString()

  if (id) {
    const existing = schedules.find((item) => item.id === id)
    if (existing) {
      const updated: Schedule = {
        ...existing,
        ...nextItem,
        updatedAt: nowIso,
      }
      schedules = schedules.map((item) => (item.id === id ? updated : item))
    } else {
      schedules = [
        ...schedules,
        {
          id,
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
  // 削除後は保存ファイルと通知予約を同期させる。
  schedules = schedules.filter((item) => item.id !== id)
  await saveSchedulesToDisk(schedules)
  scheduleUpcomingNotifications()
  return schedules
}

async function updateSettings(input: AppSettingsInput): Promise<AppSettings> {
  // 設定変更後は通知タイミングや天気地域に関係する状態も更新する。
  const nextSettings = mergeSettings(input)
  const weatherRegionChanged =
    nextSettings.weatherRegion !== appSettings.weatherRegion
  const startupLaunchChanged =
    nextSettings.startupLaunchEnabled !== appSettings.startupLaunchEnabled
  appSettings = nextSettings
  await saveSettingsToDisk(nextSettings)
  if (weatherRegionChanged) {
    weatherRangeCache.clear()
    weatherRangeRequests.clear()
  }
  if (startupLaunchChanged) {
    configureAutoLaunch(nextSettings.startupLaunchEnabled)
  }
  scheduleUpcomingNotifications()
  return nextSettings
}

function createWindow(): InstanceType<typeof BrowserWindow> {
  // React画面を表示する BrowserWindow。preload 経由で安全にIPCだけ公開する。
  const windowIconPath = getAppIconPath()
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
  // ウィンドウを閉じても常駐できるよう、タスクトレイメニューを作る。
  if (tray) {
    return
  }

  const fallbackIcon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAIAAACQKrqGAAAAKUlEQVR4nGNkYGD4z0AEYBxVSFJgqJQwajA0mEqYGSQxQDRA1GBoAAB2kwQVcC+hFgAAAABJRU5ErkJggg==',
  )
  const trayIconPath = getAppIconPath()
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
  // renderer の window.api から呼ばれる処理を main process 側で受ける。
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

app.on('second-instance', () => {
  if (!mainWindow) {
    return
  }
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(async () => {
  // Electron の準備完了後に、保存データの読み込みと画面作成を行う。
  if (!hasSingleInstanceLock) {
    return
  }

  app.setName(APP_DISPLAY_NAME)
  appSettings = await loadSettingsFromDisk()
  schedules = await loadSchedulesFromDisk()
  scheduleUpcomingNotifications()
  configureAutoLaunch(appSettings.startupLaunchEnabled)

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
