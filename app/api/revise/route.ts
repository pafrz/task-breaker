import OpenAI from "openai";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type TaskInput = { label: string; description: string };

export async function POST(req: NextRequest) {
  const { topic, task, previousDraft, feedback, apiKey } = (await req.json()) as {
    topic?: string;
    task?: TaskInput;
    previousDraft?: string;
    feedback?: string;
    apiKey?: string;
  };

  if (!topic || !task || !task.label || !previousDraft || !apiKey) {
    return new Response(
      JSON.stringify({ error: "topic, task, previousDraft, apiKey は必須です" }),
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
        send("start", { taskLabel: task.label, kind: feedback ? "revise" : "retry" });

        const system = `あなたは優れた文章編集者です。前回のドラフトとレビュアーからのフィードバックを受け取り、改訂版を書き直します。

重要:
- 前回のドラフトの良かった箇所は残し、フィードバックで指摘された点だけを変える意識を持つ
- 変更は「小さく的確に」。全書き直しを避ける
- プレースホルダを使わず、そのまま使える本文で返す
- 前置きや後書きは不要。本文だけを返す`;

        const feedbackSection = feedback
          ? `--- レビュアーからのフィードバック ---
${feedback}

上記のフィードバックを反映した改訂版を書いてください。`
          : `--- レビュアーからの要求 ---
別の切り口・別の書き方で、もう一度書き直してください（前回とは違うアプローチで）。`;

        const user = `全体ゴール: ${topic}

担当タスク: ${task.label}
内容の指針: ${task.description ?? "（指針なし）"}

--- 前回のドラフト ---
${previousDraft}

${feedbackSection}`;

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
