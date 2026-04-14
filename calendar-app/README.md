# Calendar Learning App

TypeScript 学習向けの Electron デスクトップカレンダーひな型です。  
React + Tailwind CSS + Zustand + date-fns + 型安全 IPC を含みます。

## 起動

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
```

## 主要ディレクトリ

```text
calendar-app/
  electron/
    main.ts          # Electron メインプロセス
    preload.ts       # contextBridge で API を公開
  shared/
    types/
      ipc.ts         # IPC チャンネルと Renderer API 型
      schedule.ts    # Schedule 型
  src/
    components/
      CalendarView.tsx
      SchedulePanel.tsx
    stores/
      useScheduleStore.ts
    utils/
      calendar.ts
    types/
      electron.d.ts
    App.tsx
    main.tsx
    index.css
```

## 実装済みの要点

- 月間カレンダー（日曜始まり）
- 当日ハイライト
- 前月・次月切り替え
- 予定の追加・編集・削除
- JSON ファイル永続化（`app.getPath('userData')/schedules.json`）
- 5分前通知（デスクトップ通知）
- トレイ常駐（閉じるで非表示、トレイから再表示・終了）
