import { getCloudflareContext } from "@opennextjs/cloudflare";
import { DOCS, VERSION } from "../../knowledge.generated";

const norm = (s: string) =>
  s.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ");

// فقط فایل‌هایی که کلمه کلیدیشون تو پیام هست (حداکثر ۲ تا)
function findDocs(msg: string) {
  const m = norm(msg);
  return DOCS.map((d) => ({ d, s: d.keywords.filter((k) => m.includes(norm(k))).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 2)
    .map((x) => x.d.text)
    .join("\n---\n");
}

// فقط مدل قوی
const MODEL_MAIN = "@cf/google/gemma-4-26b-a4b-it";
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

    const model = MODEL_MAIN;
    const context = findDocs(message);
    const key = "chat:" + (await hash(model + "|" + VERSION + "|" + message.toLowerCase()));

    // کش (فقط اگه KV وصل شده باشه)
    if (e.CACHE) {
      const hit = await e.CACHE.get(key);
      if (hit) return reply({ reply: hit, cached: true });
    }

    const result = await e.AI.run(model, {
      messages: [
        {
          role: "system",
          content: context
            ? "Reply in the same language as the user's message, briefly. Use ONLY this app info; if the answer is not in it, say you don't know.\n\n" + context
            : "Reply in the same language as the user's message, briefly.",
        },
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
