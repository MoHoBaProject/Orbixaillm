import { getCloudflareContext } from "@opennextjs/cloudflare";

// مدل سبک برای سوال‌های کوتاه، مدل قوی‌تر برای بقیه
const MODEL_LIGHT = "@cf/meta/llama-3.1-8b-instruct-fp8";
const MODEL_MAIN = "@cf/google/gemma-4-26b-a4b-it";
const SHORT_LIMIT = 40; // طول پیام (کاراکتر) برای انتخاب مدل سبک
const MAX_TOKENS = 256;
const CACHE_TTL = 86400; // یک روز

// CORS: بدون این هدرها مرورگر جواب این پروژه رو برای فرانت (دامنه‌ی دیگه) بلاک می‌کنه
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

type AiBinding = { run: (model: string, input: unknown) => Promise<any> };
type KvBinding = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, opts?: { expirationTtl?: number }) => Promise<void>;
};

async function hash(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// درخواست preflight مرورگر
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: string };
    const message = (body.message ?? "").trim().slice(0, 1000);
    if (!message) return reply({ error: "پیام خالیه" }, 400);

    const { env } = getCloudflareContext();
    const e = env as unknown as { AI: AiBinding; CACHE?: KvBinding };

    const model = message.length <= SHORT_LIMIT ? MODEL_LIGHT : MODEL_MAIN;
    const key = "chat:" + (await hash(model + "|" + message.toLowerCase()));

    // کش (فقط اگه KV وصل شده باشه)
    if (e.CACHE) {
      const hit = await e.CACHE.get(key);
      if (hit) return reply({ reply: hit, cached: true });
    }

    const result = await e.AI.run(model, {
      messages: [
        { role: "system", content: "Answer in Persian, briefly." },
        { role: "user", content: message },
      ],
      max_tokens: MAX_TOKENS,
    });

    const text = result?.response ?? result?.choices?.[0]?.message?.content ?? "";

    if (e.CACHE && text) {
      await e.CACHE.put(key, text, { expirationTtl: CACHE_TTL });
    }
    return reply({ reply: text });
  } catch (err) {
    return reply({ error: "خطا: " + String(err) }, 500);
  }
}
