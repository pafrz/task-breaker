# Task Breaker ⚡

> 課題を入力するだけで、AIが自動的にタスクに分解してくれるWebアプリ

**🔗 Live Demo:** https://task-breaker-one.vercel.app

---

## ✨ 機能

| 機能 | 詳細 |
|------|------|
| 🤖 **AI タスク生成** | Anthropic Claude Haiku 4.5 が課題を分析・タスクに分解 |
| ✏️ **タスク編集** | タスク名・所要時間をインライン編集 |
| ➕ **タスク追加/削除** | 手動でタスクの追加・削除が可能 |
| 💾 **進捗の自動保存** | ページを閉じても進捗が保持される（localStorage） |
| 📚 **履歴管理** | 最大20件の履歴を保存・切り替え |
| 📊 **進捗バー** | リアルタイムで進捗率を可視化 |
| 📱 **スマホ対応** | レスポンシブデザインで快適に使用可能 |

---

## 🛠 技術スタック

| カテゴリ | 技術 |
|----------|------|
| **フレームワーク** | Next.js 16 (App Router) |
| **言語** | TypeScript |
| **スタイリング** | Tailwind CSS |
| **AI** | Anthropic Claude Haiku 4.5 (`@anthropic-ai/sdk`) |
| **ホスティング** | Vercel |
| **状態管理** | React useState + localStorage |

---

## 🚀 セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/s24c3118ch-ops/task-breaker.git
cd task-breaker

# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:3000 を開き、[Anthropic Console](https://console.anthropic.com/) で取得した API キーを入力してください。

---

## 📁 ディレクトリ構成

```
task-breaker/
├── app/
│   ├── api/
│   │   └── breakdown/
│   │       └── route.ts   # Claude API を呼び出す API ルート
│   ├── page.tsx           # メインページ（UI 全体）
│   ├── layout.tsx
│   └── globals.css
├── public/
├── package.json
└── README.md
```

---

## 🎯 使い方

1. **API キーを入力** — [Anthropic Console](https://console.anthropic.com/) で発行したキーを入力（ブラウザ内のみ保存、外部送信なし）
2. **課題を入力** — 「期末レポート」「プレゼン準備」など、取り組みたい課題を入力
3. **「分解する」をクリック** — AI が自動でタスクに分解・時間を見積もり
4. **タスクをこなす** — チェックして進捗を管理、タスクの編集・追加も可能

---

## 👨‍💻 作者

**Mizukawa**  
📧 s24c3118ch@chibatech.ac.jp  
🎓 千葉工業大学

---

## 📄 ライセンス

MIT
