// منطق خالصِ پیدا کردن سند و ساخت جواب مرحله‌ای (بدون وابستگی، تا بشه توی تست‌ها بدون Cloudflare اجراش کرد)

export type Step = { icon: string; title: string; text: string; input?: string; app?: string };
export type Doc = {
  id: string; type: string; title: string; keywords: string[];
  requires: string[][]; excludes: string[]; text: string; steps: Step[];
};

// شکل جواب برای فرانت:
//  type "steps"    → { title, steps:[{icon,title,text,app?,input?}], reply } (reply = همون مراحل به‌صورت متن ساده)
//  type "answer"   → { reply }
//  type "offtopic" → { reply }
export type Out =
  | { type: "steps"; title: string; steps: Step[]; reply: string }
  | { type: "answer" | "offtopic"; reply: string };

export const norm = (s: string) =>
  s.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ");

// امتیاز یک سند برای این پیام (۰ = نامرتبط)
function score(d: Doc, m: string): number {
  const has = (w: string) => m.includes(norm(w));
  if (d.excludes.some(has)) return 0; // کلمه‌ی ممنوعه تو پیام بود
  if (d.requires.length && !d.requires.every((g) => g.some(has))) return 0; // همه‌ی گروه‌های لازم باید باشن
  const hits = d.keywords.filter(has).length;
  // سندی که requires داره دقیق‌تره (مثلا هم تلگرام هم بله)، پس بر سندهای عمومی‌تر می‌چربه
  return hits ? hits + (d.requires.length ? 100 : 0) : 0;
}

// سندهای مرتبط با پیام (حداکثر ۲ تا). اگه امتیاز برابر بود، سند مرحله‌ای (steps) جلوتره
export function findDocs(docs: Doc[], msg: string): Doc[] {
  const m = norm(msg);
  return docs
    .filter((d) => d.type !== "overview")
    .map((d) => ({ d, s: score(d, m) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(b.d.type === "steps") - Number(a.d.type === "steps"))
    .slice(0, 2)
    .map((x) => x.d);
}

export function stepsOut(d: Doc): Out {
  const plain =
    d.title + "\n\n" + d.steps.map((s, i) => `${s.icon} ${i + 1}. ${s.title}\n${s.text}`).join("\n\n");
  return { type: "steps", title: d.title, steps: d.steps, reply: plain };
}
