// منطق خالصِ تشخیص اپ‌ها، پیدا کردن سند و ساخت جواب مرحله‌ای (بدون وابستگی، تا بشه بدون Cloudflare تست کرد)

export type Step = { icon: string; title: string; text: string; app: string; input?: string };
export type Doc = { id: string; type: string; app: string; title: string; keywords: string[]; text: string; steps: Step[] };

// شکل جواب برای فرانت:
//  type "steps"    → { title, apps, steps:[{icon,title,text,app,input?}], reply }  (reply = همون مراحل به‌صورت متن ساده)
//  type "answer"   → { reply }
//  type "offtopic" → { reply }
// تعداد مراحل کاملاً پویاست: جمع مرحله‌های فایل اپ‌هایی که کاربر اسم برده (فرانت به تعداد steps اسلاید می‌سازه)
export type Out =
  | { type: "steps"; title: string; apps: string[]; steps: Step[]; reply: string }
  | { type: "answer" | "offtopic"; reply: string };

export const norm = (s: string) =>
  s.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ");

// اپ‌هایی که تو پیام اسمشون اومده، به ترتیب اولین جایی که تو جمله آمدن
export function mentionedApps(docs: Doc[], msg: string): Doc[] {
  const m = norm(msg);
  return docs
    .filter((d) => d.type === "app")
    .map((d) => ({ d, pos: Math.min(...d.keywords.map((k) => m.indexOf(norm(k))).filter((i) => i >= 0), Infinity) }))
    .filter((x) => x.pos !== Infinity)
    .sort((a, b) => a.pos - b.pos)
    .map((x) => x.d);
}

// سندهای معمولی (غیر اپ و غیر معرفی) که کلمه کلیدیشون تو پیام هست؛ حداکثر ۲ تا
export function findDocs(docs: Doc[], msg: string): Doc[] {
  const m = norm(msg);
  return docs
    .filter((d) => d.type === "answer")
    .map((d) => ({ d, s: d.keywords.filter((k) => m.includes(norm(k))).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 2)
    .map((x) => x.d);
}

// مراحل همه‌ی اپ‌های خواسته‌شده، پشت‌هم و به ترتیب جمله (یک اپ = مراحل همون اپ، دو اپ = جمع مراحل هر دو، ...)
export function appsOut(apps: Doc[]): Out {
  const steps = apps.flatMap((d) => d.steps);
  const title = "اتصال " + apps.map((d) => d.title).join(" و ");
  const reply =
    title + "\n\n" + steps.map((s, i) => `${s.icon} ${i + 1}. ${s.title}\n${s.text}`).join("\n\n");
  return { type: "steps", title, apps: apps.map((d) => d.app), steps, reply };
}
