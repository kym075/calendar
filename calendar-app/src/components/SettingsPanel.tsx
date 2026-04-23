import { useState } from 'react'
import type {
  AppSettings,
  AppSettingsInput,
  CalendarViewMode,
  ColorTheme,
  NotificationLeadMinutes,
} from '../../shared/types/settings'
import { colorThemes, notificationLeadMinutesOptions } from '../../shared/types/settings'

interface SettingsPanelProps {
  settings: AppSettings
  onSave: (input: AppSettingsInput) => Promise<void>
  onClose: () => void
}

const leadMinuteLabelMap: Record<NotificationLeadMinutes, string> = {
  5: '5分前',
  10: '10分前',
  60: '1時間前',
  1440: '1日前',
}

const leadMinuteDescriptionMap: Record<NotificationLeadMinutes, string> = {
  5: '直前リマインド',
  10: '少し余裕あり',
  60: '準備時間を確保',
  1440: '前日に確認',
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

export function SettingsPanel({ settings, onSave, onClose }: SettingsPanelProps) {
  const [notificationLeadMinutes, setNotificationLeadMinutes] = useState(
    settings.notificationLeadMinutes,
  )
  const [preferredViewMode, setPreferredViewMode] = useState<CalendarViewMode>(
    settings.preferredViewMode,
  )
  const [colorTheme, setColorTheme] = useState<ColorTheme>(settings.colorTheme)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      await onSave({
        notificationLeadMinutes,
        preferredViewMode,
        colorTheme,
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
              通知・既定表示・テーマをカスタマイズできます。
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
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {notificationLeadMinutesOptions.map((option) => {
                const selected = option === notificationLeadMinutes
                return (
                  <button
                    key={option}
                    type="button"
                    className={[
                      'rounded-lg border p-2 text-left transition',
                      selected
                        ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-400 dark:border-sky-500 dark:bg-sky-900/20'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
                    ].join(' ')}
                    onClick={() => setNotificationLeadMinutes(option)}
                  >
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {leadMinuteLabelMap[option]}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {leadMinuteDescriptionMap[option]}
                    </p>
                  </button>
                )
              })}
            </div>
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
                        ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-400 dark:border-sky-500 dark:bg-sky-900/20'
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
                        ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-400 dark:border-sky-500 dark:bg-sky-900/20'
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
