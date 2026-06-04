import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { topic, apiKey } = await req.json();

  if (!topic || !apiKey) {
    return NextResponse.json({ error: "topic and apiKey are required" }, { status: 400 });
  }

  const client = new OpenAI({ apiKey });

  const prompt = `あなたはタスク管理の専門家です。
以下の課題や作業を、具体的なタスクに分解してください。

課題: "${topic}"

以下のJSON形式で返してください。他のテキストは一切含めないでください:
{
  "tasks": [
    { "label": "タスク名", "minutes": 推定作業時間（整数）},
    ...
  ]
}

ルール:
- タスクは3〜8個に分解する
- 各タスクの時間は5〜120分の間にする
- タスク名は日本語で、具体的かつ簡潔に
- 合計時間は課題の規模に応じて適切に設定`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 1024,
    });

    const text = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    console.error("OpenAI API error:", err);

    if (err.status === 401) {
      return NextResponse.json({ error: "APIキーが無効です。正しいキーを入力してください。" }, { status: 401 });
    }
    if (err.status === 429) {
      return NextResponse.json({ error: "APIの利用制限に達しました。しばらく待ってから再試行してください。" }, { status: 429 });
    }
    if (err.status === 400) {
      return NextResponse.json({ error: `リクエストエラー: ${err.message ?? "不明"}` }, { status: 400 });
    }
    return NextResponse.json({ error: `エラー: ${err.message ?? "サーバーエラーが発生しました"}` }, { status: 500 });
  }
}
