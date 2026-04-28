import { format } from 'date-fns'
import { create } from 'zustand'
import type { Schedule, ScheduleId, ScheduleInput } from '../../shared/types/schedule'
import {
  defaultAppSettings,
  type AppSettings,
  type AppSettingsInput,
} from '../../shared/types/settings'
import type { DailyWeather, WeatherRangeInput } from '../../shared/types/weather'
import { sortSchedules } from '../../shared/utils/schedule'

interface ScheduleState {
  schedules: Schedule[]
  settings: AppSettings
  weatherByDate: Record<string, DailyWeather>
  selectedDateKey: string
  editingId: ScheduleId | null
  loading: boolean
  error: string | null
  weatherLoading: boolean
  weatherError: string | null
  loadSchedules: () => Promise<void>
  loadSettings: () => Promise<void>
  loadWeatherRange: (input: WeatherRangeInput) => Promise<void>
  saveSchedule: (input: ScheduleInput) => Promise<void>
  deleteSchedule: (id: ScheduleId) => Promise<void>
  saveSettings: (input: AppSettingsInput) => Promise<void>
  setSelectedDate: (date: Date) => void
  setEditingId: (id: ScheduleId | null) => void
  clearError: () => void
}

export const useScheduleStore = create<ScheduleState>((set, get) => {
  // 天気取得が連続したとき、古いレスポンスで新しい表示を上書きしないための番号。
  let latestWeatherRequestId = 0
  // 予定と設定を同時に読む場合でも、全部終わるまで loading を維持する。
  let activeMainRequestCount = 0

  const startMainRequest = (): void => {
    activeMainRequestCount += 1
    set({ loading: true, error: null })
  }

  const finishMainRequest = (): void => {
    activeMainRequestCount = Math.max(0, activeMainRequestCount - 1)
    if (activeMainRequestCount === 0) {
      set({ loading: false })
    }
  }

  return {
    schedules: [],
    settings: defaultAppSettings,
    weatherByDate: {},
    selectedDateKey: format(new Date(), 'yyyy-MM-dd'),
    editingId: null,
    loading: false,
    error: null,
    weatherLoading: false,
    weatherError: null,

    loadSchedules: async () => {
      startMainRequest()
      try {
        const items = await window.api.getSchedules()
        set({ schedules: sortSchedules(items) })
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : '予定の読み込みに失敗しました。'
        set({ error: message })
      } finally {
        finishMainRequest()
      }
    },

    loadSettings: async () => {
      startMainRequest()
      try {
        const settings = await window.api.getSettings()
        set({ settings })
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : '設定の読み込みに失敗しました。'
        set({ error: message })
      } finally {
        finishMainRequest()
      }
    },

    loadWeatherRange: async (input: WeatherRangeInput) => {
      const requestId = latestWeatherRequestId + 1
      latestWeatherRequestId = requestId
      set({ weatherLoading: true, weatherError: null })
      try {
        const items = await window.api.getWeatherByRange(input)
        if (requestId !== latestWeatherRequestId) {
          return
        }
        set((state) => {
          const nextWeatherByDate = { ...state.weatherByDate }
          for (const item of items) {
            nextWeatherByDate[item.date] = item
          }
          return {
            weatherByDate: nextWeatherByDate,
            weatherLoading: false,
          }
        })
      } catch (error: unknown) {
        if (requestId !== latestWeatherRequestId) {
          return
        }
        const message =
          error instanceof Error
            ? error.message
            : '天気情報の取得に失敗しました。'
        set({ weatherLoading: false, weatherError: message })
      }
    },

    saveSchedule: async (input: ScheduleInput) => {
      startMainRequest()
      try {
        const items = await window.api.upsertSchedule(input)
        set({ schedules: sortSchedules(items) })
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : '予定の保存に失敗しました。'
        set({ error: message })
      } finally {
        finishMainRequest()
      }
    },

    deleteSchedule: async (id: ScheduleId) => {
      startMainRequest()
      try {
        const items = await window.api.deleteSchedule(id)
        set({ schedules: sortSchedules(items) })
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : '予定の削除に失敗しました。'
        set({ error: message })
      } finally {
        finishMainRequest()
      }
    },

    saveSettings: async (input: AppSettingsInput) => {
      startMainRequest()
      try {
        const settings = await window.api.updateSettings(input)
        const currentState = get()
        const weatherRegionChanged =
          settings.weatherRegion !== currentState.settings.weatherRegion
        if (weatherRegionChanged) {
          latestWeatherRequestId += 1
        }
        set({
          settings,
          weatherByDate: weatherRegionChanged ? {} : currentState.weatherByDate,
          weatherError: weatherRegionChanged ? null : currentState.weatherError,
        })
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : '設定の保存に失敗しました。'
        set({ error: message })
      } finally {
        finishMainRequest()
      }
    },

    setSelectedDate: (date: Date) => {
      set({ selectedDateKey: format(date, 'yyyy-MM-dd') })
    },

    setEditingId: (id: ScheduleId | null) => {
      set({ editingId: id })
    },

    clearError: () => {
      set({ error: null })
    },
  }
})
