import { getCloudflareContext } from "@opennextjs/cloudflare";
import { DOCS, VERSION } from "../../knowledge.generated";
import { mentionedApps, findDocs, appsOut, type Out } from "./match";

// مدل‌های قابل انتخاب. پیش‌فرض همون gemma. بقیه فقط برای مقایسه‌ی سرعت/کیفیت‌ان (با فرستادن "model" تو درخواست، یا صفحه‌ی چت با ?debug=1)
const MODELS: Record<string, string> = {
  gemma: "@cf/google/gemma-4-26b-a4b-it", // فعلی: خوب تو فارسی
  llama8: "@cf/meta/llama-3.1-8b-instruct-fast", // خیلی سریع؛ فارسی‌ش ضعیف‌تره
  qwen: "@cf/qwen/qwen3-30b-a3b-fp8", // MoE سبک؛ معمولا سریع
  glm: "@cf/zai-org/glm-4.7-flash", // نسخه‌ی flash
  glm53: "@cf/zai-org/glm-5.3-flash", // نسخه‌ی جدیدتر flash
  llama70: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", // قوی‌تر ولی سنگین‌تر
};
const DEFAULT_MODEL = "gemma";
const TEMPERATURE = 0.2; // کم = وفادارتر به متن آموزش‌ها
const MAX_TOKENS_ANSWER = 500; // سوال‌های معمولی (جواب کوتاه)
const CACHE_TTL = 86400; // یک روز
const PROMPT_VERSION = "6"; // با عوض کردنش، جواب‌های قدیمیِ کش‌شده نادیده گرفته می‌شن

const OFFTOPIC =
  "من فقط درباره‌ی اپ Orbix AI کمکت می‌کنم 🙂 مثلاً وصل کردن تلگرام یا بله، پخش موزیک و تنظیمات.";

// معرفی کلی اپ (فایل‌هایی با type: overview) – برای تشخیص سوال مربوط/نامربوط
const OVERVIEW = DOCS.filter((d) => d.type === "overview").map((d) => d.text).join("\n");

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

// متن جواب رو از شکل‌های مختلف خروجی Workers AI درمیاره
function extractText(r: any): string {
  const pick = (v: any): string => {
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return v.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("").trim();
    return "";
  };
  return (
    pick(r?.response) ||
    pick(r?.choices?.[0]?.message?.content) ||
    pick(r?.choices?.[0]?.text) ||
    pick(r?.output_text) ||
    pick(r?.result?.response) ||
    ""
  );
}

// درخواست preflight مرورگر
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: string; model?: string };
    const modelName = body.model && MODELS[body.model] ? body.model : DEFAULT_MODEL;
    const model = MODELS[modelName];
    const message = (body.message ?? "").trim().slice(0, 1000);
    if (!message) return reply({ error: "پیام خالیه" }, 400);

    // ۱) اپ تو سوال هست (یکی یا چندتا): مراحل فایل همون اپ‌ها پشت‌هم، بدون مدل
    //    تعداد مراحل از خود فایل‌ها میاد (تلگرام ۵، بله ۶ → تلگرام به بله = ۱۱ مرحله)
    const apps = mentionedApps(DOCS, message);
    if (apps.length >= 1) return reply(appsOut(apps));

    const { env } = getCloudflareContext();
    const e = env as unknown as { AI: AiBinding; CACHE?: KvBinding };

    let ms = 0; // زمان صرف‌شده برای مدل (میلی‌ثانیه)
    const ask = async (system: string, maxTokens: number) => {
      const t0 = Date.now();
      const run = (extra: object) =>
        e.AI.run(model, {
          messages: [
            { role: "system", content: system },
            { role: "user", content: message },
          ],
          max_tokens: maxTokens,
          temperature: TEMPERATURE,
          ...extra,
        });
      let result: any;
      try {
        // فکر کردن خاموش (طبق مستندات Workers AI، Gemma 4 پیش‌فرض اول "فکر" می‌کنه؛ برای جواب از روی آموزش‌ها لازم نیست)
        result = await run({ chat_template_kwargs: { enable_thinking: false } });
      } catch {
        result = await run({}); // بعضی مدل‌ها این پارامتر رو قبول نمی‌کنن
      }
      ms = Date.now() - t0;
      return { text: extractText(result), result };
    };

    const key = "chat:" + (await hash(model + "|" + PROMPT_VERSION + "|" + VERSION + "|" + message.toLowerCase()));
    if (e.CACHE) {
      const hit = await e.CACHE.get(key);
      if (hit) return reply({ ...(JSON.parse(hit) as Out), cached: true });
    }
    const save = async (out: Out) => {
      if (e.CACHE) await e.CACHE.put(key, JSON.stringify(out), { expirationTtl: CACHE_TTL });
      return reply({ ...out, model: modelName, ms });
    };

    // ۲) هیچ اپی تو سوال نیست: سند مرتبط (مثلا موزیک) یا معرفی کلی اپ؛ بیرون از این‌ها = سوال نامربوط
    const docs = findDocs(DOCS, message);
    const info = docs.length ? docs.map((d) => d.text).join("\n---\n") : OVERVIEW;
    if (!info) return reply({ type: "offtopic", reply: OFFTOPIC } satisfies Out);

    const system =
      "You are the help assistant inside the Orbix AI app. Answer ONLY using the app info below. " +
      "If the question is not about using this app, or the info does not answer it, reply with exactly: NO_ANSWER\n" +
      "Reply in the same language as the user's message (usually Persian). Be simple, warm and short. " +
      "Use short numbered steps, one line each, and start every line with one fitting emoji. " +
      "Keep button and menu names exactly as written in the info and keep any icons found there " +
      "(example: ⚙️ تنظیمات ← 🎵 موزیک ← 🎶 آهنگ). No markdown bold, no headings, no long intro.\n\nAPP INFO:\n" +
      info;

    const { text, result } = await ask(system, MAX_TOKENS_ANSWER);
    if (!text) {
      const keys = result && typeof result === "object" ? Object.keys(result).join(",") : typeof result;
      const finish = result?.choices?.[0]?.finish_reason ?? "";
      return reply({ error: "مدل جواب خالی داد (" + keys + (finish ? " / " + finish : "") + ")" }, 502);
    }
    return save(text.includes("NO_ANSWER") ? { type: "offtopic", reply: OFFTOPIC } : { type: "answer", reply: text });
  } catch (err) {
    return reply({ error: "خطا: " + String(err) }, 500);
  }
}
