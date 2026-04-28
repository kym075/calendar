import { useState } from 'react'
import type {
  AppSettings,
  AppSettingsInput,
  CalendarViewMode,
  ColorTheme,
  WeatherRegion,
} from '../../shared/types/settings'
import {
  colorThemes,
  notificationLeadMinutesMax,
  notificationLeadMinutesMin,
  notificationLeadMinutesOptions,
  weatherRegions,
} from '../../shared/types/settings'

interface SettingsPanelProps {
  settings: AppSettings
  onSave: (input: AppSettingsInput) => Promise<void>
  onClose: () => void
}

const viewModeLabelMap: Record<CalendarViewMode, string> = {
  month: '月表示',
  week: '週表示',
  year: '年表示',
}

const viewModeDescriptionMap: Record<CalendarViewMode, string> = {
  month: '全体の予定を一覧',
  week: '1週間を詳細表示',
  year: '年間の件数を俯瞰',
}

const colorThemeLabelMap: Record<ColorTheme, string> = {
  classic: 'クラシック',
  white: 'ホワイト',
}

const colorThemeDescriptionMap: Record<ColorTheme, string> = {
  classic: '従来のグラデーション',
  white: '明るくシンプルな配色',
}

const weatherRegionLabelMap: Record<WeatherRegion, string> = {
  nagoya: '名古屋',
  tokyo: '東京',
  osaka: '大阪',
  sapporo: '札幌',
  fukuoka: '福岡',
}

const weatherRegionDescriptionMap: Record<WeatherRegion, string> = {
  nagoya: '中部地方の予報を反映',
  tokyo: '関東地方の予報を反映',
  osaka: '関西地方の予報を反映',
  sapporo: '北海道地方の予報を反映',
  fukuoka: '九州地方の予報を反映',
}

function formatLeadMinutesLabel(minutes: number): string {
  if (minutes === 24 * 60) {
    return '1日前'
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}時間前`
  }
  return `${minutes}分前`
}

function getLeadMinutesDescription(minutes: number): string {
  if (minutes === 5) {
    return '直前リマインド'
  }
  if (minutes === 10) {
    return '少し余裕あり'
  }
  if (minutes === 60) {
    return '準備時間を確保'
  }
  if (minutes === 24 * 60) {
    return '前日に確認'
  }
  return '自由に指定'
}

export function SettingsPanel({ settings, onSave, onClose }: SettingsPanelProps) {
  const isPresetLeadMinutes = notificationLeadMinutesOptions.some(
    (option) => option === settings.notificationLeadMinutes,
  )
  const [notificationLeadMinutes, setNotificationLeadMinutes] = useState(
    settings.notificationLeadMinutes,
  )
  const [notificationLeadMode, setNotificationLeadMode] = useState<
    'preset' | 'custom'
  >(isPresetLeadMinutes ? 'preset' : 'custom')
  const [customNotificationLeadMinutes, setCustomNotificationLeadMinutes] =
    useState(String(settings.notificationLeadMinutes))
  const [preferredViewMode, setPreferredViewMode] = useState<CalendarViewMode>(
    settings.preferredViewMode,
  )
  const [colorTheme, setColorTheme] = useState<ColorTheme>(settings.colorTheme)
  const [weatherRegion, setWeatherRegion] = useState<WeatherRegion>(
    settings.weatherRegion,
  )
  const [startupLaunchEnabled, setStartupLaunchEnabled] = useState(
    settings.startupLaunchEnabled,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const nextNotificationLeadMinutes =
        notificationLeadMode === 'custom'
          ? Number(customNotificationLeadMinutes)
          : notificationLeadMinutes
      if (
        !Number.isInteger(nextNotificationLeadMinutes) ||
        nextNotificationLeadMinutes < notificationLeadMinutesMin ||
        nextNotificationLeadMinutes > notificationLeadMinutesMax
      ) {
        setError(
          `通知タイミングは${notificationLeadMinutesMin}〜${notificationLeadMinutesMax}分で入力してください。`,
        )
        return
      }

      await onSave({
        notificationLeadMinutes: nextNotificationLeadMinutes,
        preferredViewMode,
        colorTheme,
        weatherRegion,
        startupLaunchEnabled,
      })
      onClose()
    } catch (saveError: unknown) {
      const message =
        saveError instanceof Error ? saveError.message : '設定の保存に失敗しました。'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-2 backdrop-blur-[1px]">
      <section className="mx-auto flex h-full max-w-2xl flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">設定</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              通知・既定表示・テーマ・天気地域・自動起動をカスタマイズできます。
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            閉じる
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto pr-1">
          <section className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              通知タイミング
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {notificationLeadMinutesOptions.map((option) => {
                const selected =
                  notificationLeadMode === 'preset' &&
                  option === notificationLeadMinutes
                return (
                  <button
                    key={option}
                    type="button"
                    className={[
                      'rounded-lg border p-2 text-left transition',
                      selected
                        ? 'border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-900/20'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
                    ].join(' ')}
                    onClick={() => {
                      setNotificationLeadMode('preset')
                      setNotificationLeadMinutes(option)
                    }}
                  >
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {formatLeadMinutesLabel(option)}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {getLeadMinutesDescription(option)}
                    </p>
                  </button>
                )
              })}
              <button
                type="button"
                className={[
                  'rounded-lg border p-2 text-left transition',
                  notificationLeadMode === 'custom'
                    ? 'border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-900/20'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
                ].join(' ')}
                onClick={() => setNotificationLeadMode('custom')}
              >
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  その他
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  分数を入力
                </p>
              </button>
            </div>
            {notificationLeadMode === 'custom' && (
              <label className="mt-3 block text-xs text-slate-500 dark:text-slate-400">
                通知する分数
                <input
                  type="number"
                  min={notificationLeadMinutesMin}
                  max={notificationLeadMinutesMax}
                  value={customNotificationLeadMinutes}
                  onChange={(event) => {
                    setCustomNotificationLeadMinutes(event.target.value)
                    const nextValue = Number(event.target.value)
                    if (Number.isInteger(nextValue)) {
                      setNotificationLeadMinutes(nextValue)
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <span className="mt-1 block text-[11px]">
                  {notificationLeadMinutesMin}〜{notificationLeadMinutesMax}分前まで指定できます。
                </span>
              </label>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              既定の表示モード
            </h3>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(Object.keys(viewModeLabelMap) as CalendarViewMode[]).map((option) => {
                const selected = option === preferredViewMode
                return (
                  <button
                    key={option}
                    type="button"
                    className={[
                      'rounded-lg border p-2 text-left transition',
                      selected
                        ? 'border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-900/20'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
                    ].join(' ')}
                    onClick={() => setPreferredViewMode(option)}
                  >
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {viewModeLabelMap[option]}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {viewModeDescriptionMap[option]}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              画面テーマ
            </h3>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {colorThemes.map((option) => {
                const selected = option === colorTheme
                return (
                  <button
                    key={option}
                    type="button"
                    className={[
                      'rounded-lg border p-2 text-left transition',
                      selected
                        ? 'border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-900/20'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
                    ].join(' ')}
                    onClick={() => setColorTheme(option)}
                  >
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {colorThemeLabelMap[option]}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {colorThemeDescriptionMap[option]}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              天気の地域
            </h3>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {weatherRegions.map((option) => {
                const selected = option === weatherRegion
                return (
                  <button
                    key={option}
                    type="button"
                    className={[
                      'rounded-lg border p-2 text-left transition',
                      selected
                        ? 'border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-900/20'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
                    ].join(' ')}
                    onClick={() => setWeatherRegion(option)}
                  >
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {weatherRegionLabelMap[option]}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {weatherRegionDescriptionMap[option]}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              自動起動
            </h3>
            <label className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-left dark:border-slate-700">
              <span>
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                  PC起動時にTokiを起動
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                  Windowsログイン時にトレイ常駐で起動します。
                </span>
              </span>
              <input
                type="checkbox"
                checked={startupLaunchEnabled}
                onChange={(event) => setStartupLaunchEnabled(event.target.checked)}
                className="h-5 w-5 shrink-0 accent-sky-600"
              />
            </label>
          </section>

          {error && (
            <p className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </section>
    </div>
  )
}
