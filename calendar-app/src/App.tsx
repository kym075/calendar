import { parse, startOfMonth } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { CalendarView } from './components/CalendarView'
import { SchedulePanel } from './components/SchedulePanel'
import { useScheduleStore } from './stores/useScheduleStore'
import { buildScheduleMap } from './utils/calendar'
import type { ScheduleInput } from '../shared/types/schedule'

function parseDateKey(value: string): Date {
  return parse(value, 'yyyy-MM-dd', new Date())
}

function App() {
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(new Date()))

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
  const schedulesByDate = useMemo(() => buildScheduleMap(schedules), [schedules])
  const daySchedules = schedulesByDate[selectedDateKey] ?? []
  const editingSchedule = useMemo(
    () => schedules.find((item) => item.id === editingId) ?? null,
    [schedules, editingId],
  )

  const handleSubmit = async (input: ScheduleInput): Promise<void> => {
    await saveSchedule(input)
    setEditingId(null)
  }

  const handleDelete = async (id: string): Promise<void> => {
    await deleteSchedule(id)
    if (editingId === id) {
      setEditingId(null)
    }
  }

  return (
    <main className="min-h-screen p-4 text-slate-800 dark:text-slate-100 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
          <h1 className="text-xl font-bold">Calendar Learning App</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Electron + React + TypeScript + Tailwind + Zustand + date-fns
          </p>
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

        <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <CalendarView
            viewMonth={viewMonth}
            selectedDate={selectedDate}
            schedulesByDate={schedulesByDate}
            onChangeMonth={setViewMonth}
            onSelectDate={(date) => {
              setSelectedDate(date)
              setViewMonth(startOfMonth(date))
              setEditingId(null)
            }}
          />

          <SchedulePanel
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
          <p className="text-xs text-slate-500 dark:text-slate-400">
            データ同期中...
          </p>
        )}
      </div>
    </main>
  )
}

export default App
