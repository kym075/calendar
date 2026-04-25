import type { Schedule, ScheduleId, ScheduleInput } from './schedule'
import type { AppSettings, AppSettingsInput } from './settings'
import type { DailyWeather, WeatherRangeInput } from './weather'

export const ipcChannels = {
  schedules: {
    list: 'schedules:list',
    upsert: 'schedules:upsert',
    remove: 'schedules:remove',
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update',
  },
  weather: {
    byRange: 'weather:byRange',
  },
} as const

export interface RendererApi {
  getSchedules: () => Promise<Schedule[]>
  upsertSchedule: (input: ScheduleInput) => Promise<Schedule[]>
  deleteSchedule: (id: ScheduleId) => Promise<Schedule[]>
  getSettings: () => Promise<AppSettings>
  updateSettings: (input: AppSettingsInput) => Promise<AppSettings>
  getWeatherByRange: (input: WeatherRangeInput) => Promise<DailyWeather[]>
}
