import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { topic, apiKey } = await req.json();

  if (!topic || !apiKey) {
    return NextResponse.json({ error: "topic と apiKey は必須です" }, { status: 400 });
  }

  const client = new OpenAI({ apiKey });

  const system = `あなたは文章制作のプロフェッショナルです。ユーザーのゴールを受け取り、そのゴールに必要な「文章成果物」の集まりへ分解します。

出力は必ずJSONオブジェクトで、他のテキストは一切含めないでください。`;

  const user = `ゴール: "${topic}"

このゴールを達成するために書くべき文章成果物を、独立して書ける単位に分けてください。

出力形式:
{
  "tasks": [
    { "label": "タスク名（30字以内）", "description": "そのタスクで書くべき文章の目的・分量感・トーン（100〜150字）" }
  ]
}

ルール:
- タスク数は 3〜6 個
- 各タスクは、ひとつの文章単位（例: 導入セクション、比較パラグラフ、キャッチコピー、結論、Q&A）に対応する
- 順序は執筆の自然な流れに沿う
- description は、後段のAIがそのままドラフトを書ける具体度で書く`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1024,
    });

    const text = response.choices[0]?.message?.content ?? "";
    if (!text) {
      return NextResponse.json({ error: "AIから応答が得られませんでした" }, { status: 500 });
    }
    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    console.error("OpenAI API error:", err);

    if (err.status === 401) {
      return NextResponse.json(
        { error: "APIキーが無効です。sk-... で始まる OpenAI キーを確認してください。" },
        { status: 401 }
      );
    }
    if (err.status === 429) {
      return NextResponse.json(
        { error: "レート制限またはクレジット切れの可能性。OpenAIダッシュボードを確認してください。" },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: err.message ?? "サーバーエラーが発生しました" }, { status: 500 });
  }
}
