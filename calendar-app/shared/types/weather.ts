export interface WeatherRangeInput {
  startDate: string
  endDate: string
}

export interface DailyWeather {
  date: string
  weatherCode: number
  weatherLabel: string
  weatherShortLabel: string
  temperatureMaxC: number | null
  temperatureMinC: number | null
}
