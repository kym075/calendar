import electron from 'electron'
import { ipcChannels } from '../shared/types/ipc'
import type { RendererApi } from '../shared/types/ipc'
import type { ScheduleId, ScheduleInput } from '../shared/types/schedule'
import type { AppSettingsInput } from '../shared/types/settings'
import type { WeatherRangeInput } from '../shared/types/weather'

const { contextBridge, ipcRenderer } = electron

// Renderer(React側)には ipcRenderer を直接渡さず、
// 使ってよい操作だけを window.api として公開する。
const api: RendererApi = {
  // 予定データは main process 側でファイルに保存・読み込みする。
  getSchedules: () => ipcRenderer.invoke(ipcChannels.schedules.list),
  upsertSchedule: (input: ScheduleInput) =>
    ipcRenderer.invoke(ipcChannels.schedules.upsert, input),
  deleteSchedule: (id: ScheduleId) =>
    ipcRenderer.invoke(ipcChannels.schedules.remove, id),
  // 設定も main process 側で永続化する。
  getSettings: () => ipcRenderer.invoke(ipcChannels.settings.get),
  updateSettings: (input: AppSettingsInput) =>
    ipcRenderer.invoke(ipcChannels.settings.update, input),
  // 天気APIへの実通信は main process に集約し、rendererからは範囲だけ渡す。
  getWeatherByRange: (input: WeatherRangeInput) =>
    ipcRenderer.invoke(ipcChannels.weather.byRange, input),
}

contextBridge.exposeInMainWorld('api', api)
