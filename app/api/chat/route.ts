import { getCloudflareContext } from "@opennextjs/cloudflare";

// مدل سبک برای سوال‌های کوتاه، مدل قوی‌تر برای بقیه
const MODEL_LIGHT = "@cf/meta/llama-3.1-8b-instruct";
const MODEL_MAIN = "@cf/google/gemma-3-12b-it";
const SHORT_LIMIT = 40; // طول پیام (کاراکتر) برای انتخاب مدل سبک
const MAX_TOKENS = 256;
const CACHE_TTL = 86400; // یک روز

type AiBinding = { run: (model: string, input: unknown) => Promise<any> };
type KvBinding = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, opts?: { expirationTtl?: number }) => Promise<void>;
};

async function hash(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: string };
    const message = (body.message ?? "").trim().slice(0, 1000);
    if (!message) return Response.json({ error: "پیام خالیه" }, { status: 400 });

    const { env } = getCloudflareContext();
    const e = env as unknown as { AI: AiBinding; CACHE?: KvBinding };

    const model = message.length <= SHORT_LIMIT ? MODEL_LIGHT : MODEL_MAIN;
    const key = "chat:" + (await hash(model + "|" + message.toLowerCase()));

    // کش (فقط اگه KV وصل شده باشه)
    if (e.CACHE) {
      const hit = await e.CACHE.get(key);
      if (hit) return Response.json({ reply: hit, cached: true });
    }

    const result = await e.AI.run(model, {
      messages: [
        { role: "system", content: "Answer in Persian, briefly." },
        { role: "user", content: message },
      ],
      max_tokens: MAX_TOKENS,
    });

    const reply = result?.response ?? result?.choices?.[0]?.message?.content ?? "";

    if (e.CACHE && reply) {
      await e.CACHE.put(key, reply, { expirationTtl: CACHE_TTL });
    }
    return Response.json({ reply });
  } catch {
    return Response.json({ error: "خطا در پاسخ‌دهی هوش مصنوعی" }, { status: 500 });
  }
}
