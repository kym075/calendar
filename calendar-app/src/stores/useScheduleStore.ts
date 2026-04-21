import { format } from 'date-fns'
import { create } from 'zustand'
import type { Schedule, ScheduleId, ScheduleInput } from '../../shared/types/schedule'
import { sortSchedules } from '../../shared/utils/schedule'

interface ScheduleState {
  schedules: Schedule[]
  selectedDateKey: string
  editingId: ScheduleId | null
  loading: boolean
  error: string | null
  loadSchedules: () => Promise<void>
  saveSchedule: (input: ScheduleInput) => Promise<void>
  deleteSchedule: (id: ScheduleId) => Promise<void>
  setSelectedDate: (date: Date) => void
  setEditingId: (id: ScheduleId | null) => void
  clearError: () => void
}

export const useScheduleStore = create<ScheduleState>((set) => ({
  schedules: [],
  selectedDateKey: format(new Date(), 'yyyy-MM-dd'),
  editingId: null,
  loading: false,
  error: null,

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
