import OpenAI from "openai";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type TaskInput = { label: string; description: string };
type Sibling = { label: string; description: string };

export async function POST(req: NextRequest) {
  const { topic, task, siblings, apiKey } = (await req.json()) as {
    topic?: string;
    task?: TaskInput;
    siblings?: Sibling[];
    apiKey?: string;
  };

  if (!topic || !task || !task.label || !apiKey) {
    return new Response(
      JSON.stringify({ error: "topic, task.label, apiKey は必須です" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const client = new OpenAI({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        send("start", { taskLabel: task.label });

        const system = `あなたは優れた文章制作者です。全体のゴールと担当タスクを受け取り、そのタスクの文章を最後まで書き上げます。

重要:
- プレースホルダ（【ここに〜】など）や、「〜が必要です」のような説明文ではなく、そのまま人前で使える完成した本文を書く
- 目的とトーンに沿った自然な日本語
- 指針に書かれた分量感を尊重する
- 前置きや後書き（例:「はい、書きます」「以上です」）は不要。本文だけを返す`;

        const siblingSection = siblings && siblings.length > 0
          ? `\n\n全体の構成（あなたが書くタスクは★印。他のタスクの内容は書かないでください。他のタスクとテーマ・トーンが揃うように意識してください）:
${siblings
              .map((s) =>
                s.label === task.label
                  ? `- ★ ${s.label}: ${s.description}`
                  : `-   ${s.label}: ${s.description}`
              )
              .join("\n")}`
          : "";

        const user = `全体ゴール: ${topic}${siblingSection}

★あなたが書くタスク: ${task.label}
内容の指針: ${task.description ?? "（指針なし。タスク名から適切に推測してください。）"}

このタスクの本文を、そのまま使える完成度で書き上げてください。`;

        const openaiStream = await client.chat.completions.create({
          model: "gpt-4o-mini",
          stream: true,
          max_tokens: 1500,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });

        for await (const chunk of openaiStream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) send("chunk", { text: delta });
        }

        send("done", {});
        controller.close();
      } catch (e: unknown) {
        const err = e as { status?: number; message?: string };
        let message = err.message ?? "Unknown";
        if (err.status === 401) {
          message = "APIキーが無効です。sk-... で始まる OpenAI キーを確認してください。";
        } else if (err.status === 429) {
          message = "レート制限またはクレジット切れの可能性。少し待ってから再試行してください。";
        }
        send("error", { message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
