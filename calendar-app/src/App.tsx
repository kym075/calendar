import { parse, startOfMonth } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { CalendarView } from './components/CalendarView'
import { SchedulePanel } from './components/SchedulePanel'
import { useScheduleStore } from './stores/useScheduleStore'
import { buildDayScheduleList, buildScheduleMap, createMonthGrid } from './utils/calendar'
import type { ScheduleInput } from '../shared/types/schedule'

type MobilePanelMode = 'none' | 'list' | 'form'

function parseDateKey(value: string): Date {
  return parse(value, 'yyyy-MM-dd', new Date())
}

function App() {
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(new Date()))
  const [mobilePanelMode, setMobilePanelMode] = useState<MobilePanelMode>('none')

  const {
    schedules,
    selectedDateKey,
    editingId,
    loading,
    error,
    loadSchedules,
    saveSchedule,
    deleteSchedule,
    setSelectedDate,
    setEditingId,
    clearError,
  } = useScheduleStore()

  useEffect(() => {
    void loadSchedules()
  }, [loadSchedules])

  const selectedDate = useMemo(
    () => parseDateKey(selectedDateKey),
    [selectedDateKey],
  )
  const monthGrid = useMemo(() => createMonthGrid(viewMonth), [viewMonth])
  const mapRangeStart = monthGrid[0] ?? selectedDate
  const mapRangeEnd = monthGrid[monthGrid.length - 1] ?? selectedDate
  const schedulesByDate = useMemo(
    () => buildScheduleMap(schedules, mapRangeStart, mapRangeEnd),
    [schedules, mapRangeStart, mapRangeEnd],
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
    setViewMonth(startOfMonth(date))
    setEditingId(null)
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

  return (
    <main className="box-border h-screen overflow-hidden text-slate-800 dark:text-slate-100">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-3 p-3 md:p-4">
        <header className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
          <h1 className="text-lg font-bold sm:text-xl">Calendar Learning App</h1>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-xl font-semibold text-white hover:bg-sky-700 lg:hidden"
            aria-label="予定を追加"
            onClick={openMobileCreate}
          >
            +
          </button>
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

        <section className="min-h-0 flex-1 lg:hidden">
          <CalendarView
            viewMonth={viewMonth}
            selectedDate={selectedDate}
            schedulesByDate={schedulesByDate}
            onChangeMonth={setViewMonth}
            onSelectDate={handleSelectDate}
            onDateDoubleTap={openMobileList}
          />
        </section>

        <section className="hidden min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-3">
          <CalendarView
            viewMonth={viewMonth}
            selectedDate={selectedDate}
            schedulesByDate={schedulesByDate}
            onChangeMonth={setViewMonth}
            onSelectDate={handleSelectDate}
          />

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
    </main>
  )
}

export default App
