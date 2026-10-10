import { getCloudflareContext } from "@opennextjs/cloudflare";
import { DOCS, VERSION, type Step } from "../../knowledge.generated";

type Doc = (typeof DOCS)[number];

const norm = (s: string) =>
  s.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ");

// سندهایی که کلمه کلیدیشون تو پیام هست (حداکثر ۲ تا). اگه امتیاز برابر بود، سند مرحله‌ای (steps) جلوتره
function findDocs(msg: string): Doc[] {
  const m = norm(msg);
  return DOCS.filter((d) => d.type !== "overview")
    .map((d) => ({ d, s: d.keywords.filter((k) => m.includes(norm(k))).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(b.d.type === "steps") - Number(a.d.type === "steps"))
    .slice(0, 2)
    .map((x) => x.d);
}

// معرفی کلی اپ (فایل‌هایی با type: overview) – برای تشخیص سوال مربوط/نامربوط
const OVERVIEW = DOCS.filter((d) => d.type === "overview").map((d) => d.text).join("\n");

const MODEL = "@cf/google/gemma-4-26b-a4b-it"; // مدل قوی (تنها مدل)
const MAX_TOKENS = 500; // جواب‌ها کوتاه و ساده‌ان
const TEMPERATURE = 0.2; // کم = وفادارتر به متن آموزش‌ها
const CACHE_TTL = 86400; // یک روز
const PROMPT_VERSION = "3"; // با عوض کردنش، جواب‌های قدیمیِ کش‌شده نادیده گرفته می‌شن

const OFFTOPIC =
  "من فقط درباره‌ی اپ Orbix AI کمکت می‌کنم 🙂 مثلاً وصل کردن تلگرام یا بله، پخش موزیک و تنظیمات.";

// CORS: بدون این هدرها مرورگر جواب این پروژه رو برای فرانت (دامنه‌ی دیگه) بلاک می‌کنه
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

// شکل جواب برای فرانت:
//  type "steps"    → { title, steps:[{icon,title,text,input?}], reply } (reply = همون مراحل به‌صورت متن ساده)
//  type "answer"   → { reply }
//  type "offtopic" → { reply }
type Out =
  | { type: "steps"; title: string; steps: Step[]; reply: string }
  | { type: "answer" | "offtopic"; reply: string };

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

function stepsOut(d: Doc): Out {
  const plain =
    d.title + "\n\n" + d.steps.map((s, i) => `${s.icon} ${i + 1}. ${s.title}\n${s.text}`).join("\n\n");
  return { type: "steps", title: d.title, steps: d.steps, reply: plain };
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

    const docs = findDocs(message);

    // ۱) آموزش مرحله‌ای (مثل وصل کردن تلگرام): بدون مدل، مستقیم از فایل آموزش، رایگان و سریع
    if (docs[0] && docs[0].type === "steps" && docs[0].steps.length) {
      return reply(stepsOut(docs[0]));
    }

    const { env } = getCloudflareContext();
    const e = env as unknown as { AI: AiBinding; CACHE?: KvBinding };

    // ۲) نه سندی پیدا شد و نه معرفی کلی اپ داریم → سوال نامربوطه، بدون مدل
    const info = docs.length ? docs.map((d) => d.text).join("\n---\n") : OVERVIEW;
    if (!info) return reply({ type: "offtopic", reply: OFFTOPIC } satisfies Out);

    const key = "chat:" + (await hash(MODEL + "|" + PROMPT_VERSION + "|" + VERSION + "|" + message.toLowerCase()));
    if (e.CACHE) {
      const hit = await e.CACHE.get(key);
      if (hit) return reply({ ...(JSON.parse(hit) as Out), cached: true });
    }

    const system =
      "You are the help assistant inside the Orbix AI app. Answer ONLY using the app info below. " +
      "If the question is not about using this app, or the info does not answer it, reply with exactly: NO_ANSWER\n" +
      "Reply in the same language as the user's message (usually Persian). Be simple, warm and short. " +
      "Use short numbered steps, one line each, and start every line with one fitting emoji. " +
      "Keep button and menu names exactly as written in the info and keep any icons found there " +
      "(example: ⚙️ تنظیمات ← 🎵 موزیک ← 🎶 آهنگ). No markdown bold, no headings, no long intro.\n\nAPP INFO:\n" +
      info;

    const result = await e.AI.run(MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      // طبق مستندات Workers AI: Gemma 4 پیش‌فرض اول "فکر" می‌کنه؛ برای جواب از روی آموزش‌ها لازم نیست
      chat_template_kwargs: { enable_thinking: false },
    });

    const text = extractText(result);
    if (!text) {
      const keys = result && typeof result === "object" ? Object.keys(result).join(",") : typeof result;
      const finish = result?.choices?.[0]?.finish_reason ?? "";
      return reply({ error: "مدل جواب خالی داد (" + keys + (finish ? " / " + finish : "") + ")" }, 502);
    }

    const out: Out = text.includes("NO_ANSWER")
      ? { type: "offtopic", reply: OFFTOPIC }
      : { type: "answer", reply: text };

    if (e.CACHE) await e.CACHE.put(key, JSON.stringify(out), { expirationTtl: CACHE_TTL });
    return reply(out);
  } catch (err) {
    return reply({ error: "خطا: " + String(err) }, 500);
  }
}
