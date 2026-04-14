import electron from 'electron'
import { ipcChannels } from '../shared/types/ipc'
import type { RendererApi } from '../shared/types/ipc'
import type { ScheduleId, ScheduleInput } from '../shared/types/schedule'

const { contextBridge, ipcRenderer } = electron

const api: RendererApi = {
  getSchedules: () => ipcRenderer.invoke(ipcChannels.schedules.list),
  upsertSchedule: (input: ScheduleInput) =>
    ipcRenderer.invoke(ipcChannels.schedules.upsert, input),
  deleteSchedule: (id: ScheduleId) =>
    ipcRenderer.invoke(ipcChannels.schedules.remove, id),
}

contextBridge.exposeInMainWorld('api', api)
