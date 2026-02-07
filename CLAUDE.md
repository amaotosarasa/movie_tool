# CLAUDE.md

このファイルは、このリポジトリでコードを扱う際のClaude Code (claude.ai/code) への指針を提供します。

## 開発コマンド

全ての開発は`neeview-clone/`ディレクトリで行ってください：

```bash
cd neeview-clone
npm install           # 依存関係をインストール
npm run dev          # ホットリロード付き開発サーバーを起動
npm run build        # 本番用ビルド
npm run preview      # ビルド済みアプリケーションのプレビュー
npm run package     # 実行ファイルとしてパッケージ化
npm run make        # インストーラーパッケージを作成
```

## アーキテクチャ概要

これはElectronベースのNeeViewクローンで、漫画・書籍閲覧のための見開き表示機能を持つ画像・動画ビューアアプリケーションです。

### コアアーキテクチャパターン

**3プロセスアーキテクチャ：**
- **メインプロセス** (`electron/main.ts`)：アプリケーションライフサイクル管理、ファイルシステムアクセス、IPCハンドラー
- **プリロードスクリプト** (`electron/preload.ts`)：`contextBridge`を介したメインプロセスとレンダラープロセス間のセキュアなブリッジ
- **レンダラープロセス** (`src/`)：TypeScript使用のReactベースUI

### 主要アーキテクチャコンポーネント

**IPC通信：**
- メインプロセスがIPCハンドラー経由でファイル操作を公開（`dialog:openFile`、`folder:scan`等）
- プリロードスクリプトが`window.api`に型付きAPIサーフェスを作成
- セキュアなローカルファイルアクセス用カスタムプロトコル`safe-file://`

**状態管理：**
- Reactステートを使用して`App.tsx`で一元化
- 主要な状態：`currentFile`、`files[]`、`currentIndex`、ビュー設定
- 現在は外部状態管理ライブラリ未使用（Zustandはインストール済みだが未使用）

**ファイル処理：**
- 画像（jpg, png, gif, webp, bmp, svg）と動画（mp4, avi, mkv, mov等）をサポート
- メインプロセス経由でのソート/フィルターオプション付きフォルダスキャン
- アーカイブサポートライブラリがインストール済み（adm-zip, node-unrar-js）だが未実装

**メディア表示：**
- `ImageViewer`：ズーム、パン、回転、フィットモードを処理
- `VideoPlayer`：再生コントロール用のVideo.js統合
- 各ビューアが独立コンポーネントのコンポーネントベースアーキテクチャ

**セキュリティモデル：**
- `contextIsolation: true`、`nodeIntegration: false`
- セキュアなメディアアクセス用カスタムファイルプロトコル
- セキュリティ境界を維持するIPCベースのファイル操作

### プロジェクト構造

```
neeview-clone/
├── electron/           # メインプロセスコード
│   ├── main.ts        # アプリライフサイクル、IPCハンドラー、ファイル操作
│   └── preload.ts     # セキュアAPIブリッジ
├── src/               # レンダラープロセス（React）
│   ├── components/    # UIコンポーネント（Toolbar、FileList、ImageViewer等）
│   ├── types/         # IPCとメディア型のTypeScript定義
│   └── App.tsx        # メインアプリケーション状態とレイアウト
└── index.html         # レンダラーエントリポイント
```

### 重要な実装詳細

**ファイルURL生成：**
- ローカルファイルはメインプロセスで登録された`safe-file://`プロトコルを使用
- セキュリティのためメインプロセスでパス変換を処理

**エラーハンドリング：**
- App.tsxで一元化されたエラー状態
- ユーザーフレンドリーなメッセージ付きtry-catchでラップされたIPC操作
- 非同期操作用の管理されたローディング状態

**キーボードショートカット：**
- 包括的なkeydownイベントリスナーでApp.tsxで処理
- ナビゲーション用矢印キー、フルスクリーン用F11（部分的）、サイドバー切り替え用Tab

**依存関係注記：**
- アーカイブライブラリ（adm-zip、node-unrar-js）がインストール済みだが未実装
- 設定永続化用electron-storeがインストール済みだが未使用
- 状態管理用Zustandがインストール済みだが現在はReactステートを使用

## 主要設定

**Vite設定：** main/preload/rendererプロセス用の個別ビルドターゲットでelectron-viteを使用
**TypeScript：** src/用パスエイリアス（@/と@renderer/）でStrictモード有効
**スタイリング：** コンポーネントスタイリング用TailwindCSS

## 現在の実装状況

**完成済み機能：**
- ナビゲーション付き基本画像/動画表示
- ソートオプション付きフォルダスキャン
- サムネイル付きファイルリストサイドバー
- ウィンドウコントロールと基本キーボードショートカット
- 画像のズーム/パン、動画再生コントロール

**準備済みだが未実装：**
- アーカイブファイルサポート（ZIP/RAR）
- electron-storeによる設定永続化
- Zustandによる高度な状態管理
- 漫画閲覧用見開きビュー（2ページ表示）

新機能を開発する際は、確立されたIPCパターンに従ってください：main.tsにハンドラーを追加、preload.ts経由で公開、window.api経由でReactコンポーネントで消費。