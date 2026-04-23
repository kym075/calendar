import { parse, startOfMonth, startOfWeek, startOfYear } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { CalendarView } from './components/CalendarView'
import { SchedulePanel } from './components/SchedulePanel'
import { SettingsPanel } from './components/SettingsPanel'
import { WeekView } from './components/WeekView'
import { YearView } from './components/YearView'
import { useScheduleStore } from './stores/useScheduleStore'
import {
  buildDayScheduleList,
  buildScheduleMap,
  buildYearMonthCountMap,
  createMonthGrid,
  createWeekGrid,
} from './utils/calendar'
import type { ScheduleInput } from '../shared/types/schedule'
import type { AppSettingsInput, CalendarViewMode } from '../shared/types/settings'

type MobilePanelMode = 'none' | 'list' | 'form'

const viewModeLabelMap: Record<CalendarViewMode, string> = {
  month: '月',
  week: '週',
  year: '年',
}

function parseDateKey(value: string): Date {
  return parse(value, 'yyyy-MM-dd', new Date())
}

function App() {
  const [viewDate, setViewDate] = useState<Date>(new Date())
  const [viewModeOverride, setViewModeOverride] =
    useState<CalendarViewMode | null>(null)
  const [mobilePanelMode, setMobilePanelMode] = useState<MobilePanelMode>('none')
  const [showSettings, setShowSettings] = useState(false)

  const {
    schedules,
    settings,
    selectedDateKey,
    editingId,
    loading,
    error,
    loadSchedules,
    loadSettings,
    saveSchedule,
    deleteSchedule,
    saveSettings,
    setSelectedDate,
    setEditingId,
    clearError,
  } = useScheduleStore()

  useEffect(() => {
    void Promise.all([loadSchedules(), loadSettings()])
  }, [loadSchedules, loadSettings])
  const viewMode = viewModeOverride ?? settings.preferredViewMode

  const selectedDate = useMemo(
    () => parseDateKey(selectedDateKey),
    [selectedDateKey],
  )

  const monthGrid = useMemo(() => createMonthGrid(startOfMonth(viewDate)), [viewDate])
  const monthRangeStart = monthGrid[0] ?? selectedDate
  const monthRangeEnd = monthGrid[monthGrid.length - 1] ?? selectedDate
  const monthSchedulesByDate = useMemo(
    () => buildScheduleMap(schedules, monthRangeStart, monthRangeEnd),
    [schedules, monthRangeStart, monthRangeEnd],
  )

  const weekGrid = useMemo(() => createWeekGrid(startOfWeek(viewDate)), [viewDate])
  const weekRangeStart = weekGrid[0] ?? selectedDate
  const weekRangeEnd = weekGrid[weekGrid.length - 1] ?? selectedDate
  const weekSchedulesByDate = useMemo(
    () => buildScheduleMap(schedules, weekRangeStart, weekRangeEnd),
    [schedules, weekRangeStart, weekRangeEnd],
  )

  const yearMonthCounts = useMemo(
    () => buildYearMonthCountMap(schedules, startOfYear(viewDate)),
    [schedules, viewDate],
  )

  const daySchedules = useMemo(
    () => buildDayScheduleList(schedules, selectedDate),
    [schedules, selectedDate],
  )
  const editingSchedule = useMemo(
    () => schedules.find((item) => item.id === editingId) ?? null,
    [schedules, editingId],
  )
  const schedulePanelKey = `${selectedDateKey}:${editingId ?? 'new'}`

  const handleSubmit = async (input: ScheduleInput): Promise<void> => {
    await saveSchedule(input)
    setEditingId(null)
    if (mobilePanelMode === 'form') {
      setMobilePanelMode('list')
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    await deleteSchedule(id)
    if (editingId === id) {
      setEditingId(null)
    }
  }

  const handleSelectDate = (date: Date): void => {
    setSelectedDate(date)
    setViewDate(date)
    setEditingId(null)
  }

  const handleSelectMonth = (date: Date): void => {
    handleSelectDate(date)
    if (mobilePanelMode === 'none') {
      setMobilePanelMode('list')
    }
  }

  const openMobileList = (date: Date): void => {
    handleSelectDate(date)
    setMobilePanelMode('list')
  }

  const openMobileCreate = (): void => {
    setEditingId(null)
    setMobilePanelMode('form')
  }

  const closeMobilePanel = (): void => {
    setMobilePanelMode('none')
    setEditingId(null)
  }

  const openMobileEdit = (id: string): void => {
    setEditingId(id)
    setMobilePanelMode('form')
  }

  const cancelMobileEdit = (): void => {
    setEditingId(null)
    setMobilePanelMode('list')
  }

  const handleSaveSettings = async (input: AppSettingsInput): Promise<void> => {
    await saveSettings(input)
    setViewModeOverride(null)
  }

  const renderCalendarView = (mobile: boolean) => {
    if (viewMode === 'week') {
      return (
        <WeekView
          viewWeek={startOfWeek(viewDate)}
          selectedDate={selectedDate}
          schedulesByDate={weekSchedulesByDate}
          onChangeWeek={setViewDate}
          onSelectDate={handleSelectDate}
          onDateDoubleTap={mobile ? openMobileList : undefined}
        />
      )
    }

    if (viewMode === 'year') {
      return (
        <YearView
          viewYear={startOfYear(viewDate)}
          selectedDate={selectedDate}
          monthCounts={yearMonthCounts}
          onChangeYear={setViewDate}
          onSelectMonth={handleSelectMonth}
        />
      )
    }

    return (
      <CalendarView
        viewMonth={startOfMonth(viewDate)}
        selectedDate={selectedDate}
        schedulesByDate={monthSchedulesByDate}
        onChangeMonth={setViewDate}
        onSelectDate={handleSelectDate}
        onDateDoubleTap={mobile ? openMobileList : undefined}
      />
    )
  }

  return (
    <main className="box-border h-screen overflow-hidden text-slate-800 dark:text-slate-100">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-3 p-3 md:p-4">
        <header className="space-y-2 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold sm:text-xl">Calendar Learning App</h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 sm:px-3 sm:text-sm dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setShowSettings(true)}
              >
                設定
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-xl font-semibold text-white hover:bg-sky-700 lg:hidden"
                aria-label="予定を追加"
                onClick={openMobileCreate}
              >
                +
              </button>
            </div>
          </div>

          <div className="inline-flex w-full items-center rounded-lg border border-slate-200 p-1 dark:border-slate-700">
            {(Object.keys(viewModeLabelMap) as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={[
                  'flex-1 rounded-md px-3 py-1.5 text-sm font-medium',
                  viewMode === mode
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                ].join(' ')}
                onClick={() => setViewModeOverride(mode)}
              >
                {viewModeLabelMap[mode]}
              </button>
            ))}
          </div>
        </header>

        {error && (
          <div className="flex items-center justify-between rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/60 dark:bg-rose-900/20 dark:text-rose-300">
            <span>{error}</span>
            <button
              type="button"
              className="rounded border border-rose-300 px-2 py-1 text-xs hover:bg-rose-100 dark:border-rose-500/60 dark:hover:bg-rose-800/40"
              onClick={clearError}
            >
              閉じる
            </button>
          </div>
        )}

        <section className="min-h-0 flex-1 lg:hidden">{renderCalendarView(true)}</section>

        <section className="hidden min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-3">
          {renderCalendarView(false)}

          <SchedulePanel
            key={`desktop:${schedulePanelKey}`}
            selectedDate={selectedDate}
            daySchedules={daySchedules}
            editingSchedule={editingSchedule}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            onStartEdit={setEditingId}
            onCancelEdit={() => setEditingId(null)}
          />
        </section>

        {loading && (
          <p className="hidden shrink-0 text-xs text-slate-500 dark:text-slate-400 lg:block">
            データ同期中...
          </p>
        )}
      </div>

      {mobilePanelMode !== 'none' && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 p-2 backdrop-blur-[1px] lg:hidden">
          <SchedulePanel
            key={`mobile:${schedulePanelKey}:${mobilePanelMode}`}
            className="h-full overflow-y-auto"
            selectedDate={selectedDate}
            daySchedules={daySchedules}
            editingSchedule={editingSchedule}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            onStartEdit={openMobileEdit}
            onCancelEdit={cancelMobileEdit}
            viewMode={mobilePanelMode}
            onRequestClose={closeMobilePanel}
          />
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </main>
  )
}

export default App
