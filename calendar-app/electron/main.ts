import electron from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, isBefore, isValid, parse, parseISO, startOfDay } from 'date-fns'
import { ipcChannels } from '../shared/types/ipc'
import {
  isColorTheme,
  defaultAppSettings,
  isCalendarViewMode,
  isNotificationLeadMinutes,
  type AppSettings,
  type AppSettingsInput,
  type NotificationLeadMinutes,
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

const __dirname = dirname(fileURLToPath(import.meta.url))
const MINUTE_MS = 60 * 1000
const MAX_SET_TIMEOUT_MS = 2_147_483_647
const STARTUP_ARG = '--startup'
const APP_DISPLAY_NAME = 'Toki'
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
  }
}

function mergeSettings(input: AppSettingsInput): AppSettings {
  const nextLeadMinutes = input.notificationLeadMinutes
  const nextViewMode = input.preferredViewMode
  const nextColorTheme = input.colorTheme

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

  return {
    notificationLeadMinutes:
      nextLeadMinutes ?? appSettings.notificationLeadMinutes,
    preferredViewMode: nextViewMode ?? appSettings.preferredViewMode,
    colorTheme: nextColorTheme ?? appSettings.colorTheme,
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
  appSettings = nextSettings
  await saveSettingsToDisk(nextSettings)
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
