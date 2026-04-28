# Toki - Calendar App

Electron + React で作成したデスクトップカレンダーアプリです。予定管理、繰り返し予定、通知、天気表示、テーマ切り替えに対応しています。

## 主な機能

- 月・週・年表示のカレンダー
- 予定の追加・編集・削除
- 終日予定、複数日予定、繰り返し予定
- タイトル・メモ・カテゴリ色での絞り込み
- 予定前のデスクトップ通知
- Open-Meteo を使った天気表示
- JSON ファイル永続化
- トレイ常駐
- クラシックテーマ / ホワイトテーマ

## 開発環境で起動

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
```

## Windows 配布用 exe の作成

Windows 用インストーラーを作る場合は、次のコマンドを実行します。

```bash
npm run dist
```

出力先は `release/` です。通常は `Toki Setup ... .exe` のような NSIS インストーラーが作成されます。

`npm run dist` は内部で次を実行します。

```bash
npm run icons:generate
npm run build
electron-builder --win nsis
```

## 主要ディレクトリ

```text
calendar-app/
  electron/
    main.ts          # Electron メインプロセス
    preload.ts       # contextBridge で renderer 用 API を公開
  shared/
    types/
      ipc.ts         # IPC チャンネルと Renderer API 型
      schedule.ts    # 予定関連の型
      settings.ts    # 設定関連の型
      weather.ts     # 天気関連の型
    utils/
      schedule.ts    # 繰り返し予定の展開ロジック
  src/
    components/      # 画面部品
    stores/          # Zustand store
    utils/           # カレンダー表示用の補助関数
    App.tsx
    main.tsx
    index.css
```

## 保存場所

予定と設定は Electron の `app.getPath('userData')` 配下に保存されます。

- `schedules.json`
- `settings.json`
