export const calendarViewModes = ['month', 'week', 'year'] as const
export const notificationLeadMinutesOptions = [5, 10, 60, 24 * 60] as const
export const colorThemes = ['classic', 'white'] as const

export type CalendarViewMode = (typeof calendarViewModes)[number]
export type NotificationLeadMinutes = (typeof notificationLeadMinutesOptions)[number]
export type ColorTheme = (typeof colorThemes)[number]

export interface AppSettings {
  notificationLeadMinutes: NotificationLeadMinutes
  preferredViewMode: CalendarViewMode
  colorTheme: ColorTheme
}

export type AppSettingsInput = Partial<AppSettings>

export const defaultAppSettings: AppSettings = {
  notificationLeadMinutes: 5,
  preferredViewMode: 'month',
  colorTheme: 'classic',
}

export function isCalendarViewMode(value: unknown): value is CalendarViewMode {
  return (
    typeof value === 'string' &&
    (calendarViewModes as readonly string[]).includes(value)
  )
}

export function isNotificationLeadMinutes(
  value: unknown,
): value is NotificationLeadMinutes {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (notificationLeadMinutesOptions as readonly number[]).includes(value)
  )
}

export function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === 'string' && (colorThemes as readonly string[]).includes(value)
}
