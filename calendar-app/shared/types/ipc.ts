import type { Schedule, ScheduleId, ScheduleInput } from './schedule'

export const ipcChannels = {
  schedules: {
    list: 'schedules:list',
    upsert: 'schedules:upsert',
    remove: 'schedules:remove',
  },
} as const

export interface RendererApi {
  getSchedules: () => Promise<Schedule[]>
  upsertSchedule: (input: ScheduleInput) => Promise<Schedule[]>
  deleteSchedule: (id: ScheduleId) => Promise<Schedule[]>
}
