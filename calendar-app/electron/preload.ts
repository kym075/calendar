import electron from 'electron'
import { ipcChannels } from '../shared/types/ipc'
import type { RendererApi } from '../shared/types/ipc'
import type { ScheduleId, ScheduleInput } from '../shared/types/schedule'
import type { AppSettingsInput } from '../shared/types/settings'

const { contextBridge, ipcRenderer } = electron

const api: RendererApi = {
  getSchedules: () => ipcRenderer.invoke(ipcChannels.schedules.list),
  upsertSchedule: (input: ScheduleInput) =>
    ipcRenderer.invoke(ipcChannels.schedules.upsert, input),
  deleteSchedule: (id: ScheduleId) =>
    ipcRenderer.invoke(ipcChannels.schedules.remove, id),
  getSettings: () => ipcRenderer.invoke(ipcChannels.settings.get),
  updateSettings: (input: AppSettingsInput) =>
    ipcRenderer.invoke(ipcChannels.settings.update, input),
}

contextBridge.exposeInMainWorld('api', api)
