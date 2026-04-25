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

export const useScheduleStore = create<ScheduleState>((set) => ({
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
    set({ loading: true, error: null })
    try {
      const items = await window.api.getSchedules()
      set({ schedules: sortSchedules(items), loading: false })
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : '予定の読み込みに失敗しました。'
      set({ loading: false, error: message })
    }
  },

  loadSettings: async () => {
    set({ loading: true, error: null })
    try {
      const settings = await window.api.getSettings()
      set({ settings, loading: false })
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '設定の読み込みに失敗しました。'
      set({ loading: false, error: message })
    }
  },

  loadWeatherRange: async (input: WeatherRangeInput) => {
    set({ weatherLoading: true, weatherError: null })
    try {
      const items = await window.api.getWeatherByRange(input)
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
      const message =
        error instanceof Error
          ? error.message
          : '天気情報の取得に失敗しました。'
      set({ weatherLoading: false, weatherError: message })
    }
  },

  saveSchedule: async (input: ScheduleInput) => {
    set({ loading: true, error: null })
    try {
      const items = await window.api.upsertSchedule(input)
      set({ schedules: sortSchedules(items), loading: false })
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '予定の保存に失敗しました。'
      set({ loading: false, error: message })
    }
  },

  deleteSchedule: async (id: ScheduleId) => {
    set({ loading: true, error: null })
    try {
      const items = await window.api.deleteSchedule(id)
      set({ schedules: sortSchedules(items), loading: false })
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '予定の削除に失敗しました。'
      set({ loading: false, error: message })
    }
  },

  saveSettings: async (input: AppSettingsInput) => {
    set({ loading: true, error: null })
    try {
      const settings = await window.api.updateSettings(input)
      set({ settings, loading: false })
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : '設定の保存に失敗しました。'
      set({ loading: false, error: message })
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
}))
