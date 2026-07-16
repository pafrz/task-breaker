# Nem の画像を差し替える手順

このフォルダに6枚のPNGを配置すると、Task Breaker のマスコットが自動で差し替わります。
PNGが無いファイルは、コード内蔵のSVGにフォールバックします（開発中でもエラーになりません）。

## 必要なファイル

| ファイル名 | 表情 | 使われる場面 |
|-----------|------|-------------|
| `default.png` | ニュートラル | 通常時（Home挨拶など） |
| `happy.png` | 満面の笑み | AI分解後・合格ライン設定後など |
| `worried.png` | 困り顔・涙目 | 予定時間超過（+0〜15分）・振り返り未達 |
| `sleepy.png` | 眠そう | AI思考中・深夜モード |
| `celebrating.png` | 大喜び | タスク完了・全完了・合格ライン達成 |
| `panicking.png` | 慌てふためき | 超過30分以上 |

## 推奨仕様

- **正方形** (例: 512×512px 以上)
- **透過PNG** (背景がアプリに馴染むため)
- **アスペクト比 1:1** (`object-fit: contain` なので歪みませんが正方形が推奨)
- **ファイルサイズ**: 各 100〜500KB 程度が望ましい

## テスト方法

1. ここに `default.png` を1枚置く
2. `npm run dev` (または本番デプロイ)
3. Home タブで Nem のヘッダーが PNG に切り替わっていれば成功
4. 他5枚も同じフォルダに追加

## Copilot でキャラを生成する例（プロンプト）

```
anime style illustration of a small fairy girl,
platinum silver hair medium length, deep dark blue eyes,
wearing oversized dark navy hoodie with small moon 🌙 embroidery,
pale skin, sitting on a large crescent moon,
soft cel-shading, transparent background,
cygames-style character art, high detail
```

このベースに表情を追加：
- default: `soft neutral smile, calm gaze`
- happy: `big smile, closed happy eyes, blush`
- worried: `sad drooping eyebrows, tearful eyes`
- sleepy: `yawning, half-closed eyes, small Z above head`
- celebrating: `wide happy smile, sparkles around, arms up`
- panicking: `wide open eyes, sweat drop, panicked expression`
