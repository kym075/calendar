export const calendarViewModes = ['month', 'week', 'year'] as const
export const notificationLeadMinutesOptions = [5, 10, 60, 24 * 60] as const
export const colorThemes = ['classic', 'white'] as const
export const weatherRegions = [
  'nagoya',
  'tokyo',
  'osaka',
  'sapporo',
  'fukuoka',
] as const

export type CalendarViewMode = (typeof calendarViewModes)[number]
export type NotificationLeadMinutes = (typeof notificationLeadMinutesOptions)[number]
export type ColorTheme = (typeof colorThemes)[number]
export type WeatherRegion = (typeof weatherRegions)[number]

export interface AppSettings {
  notificationLeadMinutes: NotificationLeadMinutes
  preferredViewMode: CalendarViewMode
  colorTheme: ColorTheme
  weatherRegion: WeatherRegion
}

export type AppSettingsInput = Partial<AppSettings>

export const defaultAppSettings: AppSettings = {
  notificationLeadMinutes: 5,
  preferredViewMode: 'month',
  colorTheme: 'classic',
  weatherRegion: 'nagoya',
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

export function isWeatherRegion(value: unknown): value is WeatherRegion {
  return (
    typeof value === 'string' &&
    (weatherRegions as readonly string[]).includes(value)
  )
}
