import electron from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, isValid, parseISO } from 'date-fns'
import { ipcChannels } from '../shared/types/ipc'
import {
  scheduleColors,
  type Schedule,
  type ScheduleColor,
  type ScheduleId,
  type ScheduleInput,
} from '../shared/types/schedule'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIVE_MINUTES_MS = 5 * 60 * 1000
const { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, Tray } =
  electron

const colorSet = new Set<ScheduleColor>(scheduleColors)

let mainWindow: InstanceType<typeof BrowserWindow> | null = null
let tray: InstanceType<typeof Tray> | null = null
let appQuitting = false
let schedules: Schedule[] = []
const notificationTimers = new Map<ScheduleId, NodeJS.Timeout>()

function getScheduleFilePath(): string {
  return join(app.getPath('userData'), 'schedules.json')
}

async function ensureScheduleFile(): Promise<void> {
  const filePath = getScheduleFilePath()
  await mkdir(dirname(filePath), { recursive: true })
  if (!existsSync(filePath)) {
    await writeFile(filePath, '[]', 'utf-8')
  }
}

function isScheduleColor(value: unknown): value is ScheduleColor {
  return typeof value === 'string' && colorSet.has(value as ScheduleColor)
}

function isSchedule(value: unknown): value is Schedule {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.startAt === 'string' &&
    typeof record.endAt === 'string' &&
    typeof record.memo === 'string' &&
    isScheduleColor(record.color) &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
  )
}

function sortSchedules(items: Schedule[]): Schedule[] {
  return [...items].sort(
    (a, b) =>
      new Date(a.startAt).getTime() - new Date(b.startAt).getTime() ||
      a.title.localeCompare(b.title, 'ja'),
  )
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
    return sortSchedules(parsed.filter(isSchedule))
  } catch {
    return []
  }
}

async function saveSchedulesToDisk(items: Schedule[]): Promise<void> {
  const filePath = getScheduleFilePath()
  await writeFile(filePath, JSON.stringify(sortSchedules(items), null, 2), 'utf-8')
}

function validateScheduleInput(input: ScheduleInput): void {
  if (input.title.trim().length === 0) {
    throw new Error('タイトルは必須です。')
  }
  if (!isScheduleColor(input.color)) {
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
}

function clearNotificationTimers(): void {
  for (const timeout of notificationTimers.values()) {
    clearTimeout(timeout)
  }
  notificationTimers.clear()
}

function scheduleUpcomingNotifications(): void {
  clearNotificationTimers()
  const now = Date.now()

  for (const schedule of schedules) {
    const start = parseISO(schedule.startAt)
    if (!isValid(start)) {
      continue
    }

    const notifyAt = start.getTime() - FIVE_MINUTES_MS
    const delay = notifyAt - now
    if (delay <= 0) {
      continue
    }

    const timeout = setTimeout(() => {
      if (Notification.isSupported()) {
        const startLabel = format(start, 'HH:mm')
        new Notification({
          title: '予定の5分前です',
          body: `${schedule.title} (${startLabel}開始)`,
        }).show()
      }
      notificationTimers.delete(schedule.id)
    }, delay)

    notificationTimers.set(schedule.id, timeout)
  }
}

async function upsertSchedule(input: ScheduleInput): Promise<Schedule[]> {
  validateScheduleInput(input)
  const nowIso = new Date().toISOString()

  const nextItem = {
    title: input.title.trim(),
    startAt: input.startAt,
    endAt: input.endAt,
    memo: input.memo.trim(),
    color: input.color,
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

function createWindow(): InstanceType<typeof BrowserWindow> {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 840,
    minHeight: 620,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
  })

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

  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAIAAACQKrqGAAAAKUlEQVR4nGNkYGD4z0AEYBxVSFJgqJQwajA0mEqYGSQxQDRA1GBoAAB2kwQVcC+hFgAAAABJRU5ErkJggg==',
  )

  tray = new Tray(icon)
  tray.setToolTip('Calendar App')
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
  schedules = await loadSchedulesFromDisk()
  scheduleUpcomingNotifications()

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
