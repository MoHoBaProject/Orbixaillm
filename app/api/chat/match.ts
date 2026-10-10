// منطق خالصِ تشخیص اپ‌ها، پیدا کردن سند و ساخت جواب مرحله‌ای (بدون وابستگی، تا بشه بدون Cloudflare تست کرد)

export type Step = {
  icon: string;
  platform: string;
  title: string;
  description: string;
  input: string;
  textbox: boolean;
  end: boolean;
};
export type Doc = { id: string; type: string; app: string; title: string; keywords: string[]; text: string; steps: Step[] };

// شکل جواب برای فرانت:
//  اپ تو سوال بود → آرایه‌ی Step[] دقیقاً به این شکل:
//     [{ icon, platform, title, description, input, textbox, end }, ...]
//  بقیه‌ی حالت‌ها (سوال نامربوط، overview، app-connection-guide، ...) → { type: "answer" | "offtopic", reply }
export type TextOut = { type: "answer" | "offtopic"; reply: string };
export type Out = Step[] | TextOut;

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

// مراحل همه‌ی اپ‌های خواسته‌شده، پشت‌هم و به ترتیب جمله (فقط آرایه‌ی مراحل)
export function appsOut(apps: Doc[]): Step[] {
  return apps.flatMap((d) => d.steps);
}
