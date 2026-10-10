"use client";
import { useEffect, useState } from "react";

type Msg = { role: "user" | "bot"; text: string; meta?: string };

// فقط با ?debug=1 دیده می‌شه: انتخاب مدل برای مقایسه‌ی سرعت و کیفیت
const MODEL_OPTIONS = ["gemma", "llama8", "qwen", "glm", "glm53", "llama70"];

// بلوک کد (همیشه چپ‌به‌راست) با دکمه‌ی کپی
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <div className="code">
      <div className="codeHead">
        <span>{lang || "code"}</span>
        <button onClick={copy}>{copied ? "کپی شد" : "کپی"}</button>
      </div>
      <pre dir="ltr"><code>{code}</code></pre>
    </div>
  );
}

// متن معمولی: جهت هر پاراگراف خودکار، و `کد داخل خط` چپ‌به‌راست
function Text({ text }: { text: string }) {
  return (
    <div dir="auto" className="txt">
      {text.split(/(`[^`\n]+`)/).map((p, i) =>
        p.length > 2 && p.startsWith("`") && p.endsWith("`") ? (
          <code key={i} className="ic">{p.slice(1, -1)}</code>
        ) : (
          p
        )
      )}
    </div>
  );
}

// متن و بلوک‌های ```کد``` رو از هم جدا می‌کنه
function Body({ text }: { text: string }) {
  const parts = text.split("```");
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 1) {
          const m = p.match(/^([\w+#-]*)\n([\s\S]*)$/);
          const lang = m ? m[1] : "";
          const code = (m ? m[2] : p).replace(/\n$/, "");
          return <CodeBlock key={i} lang={lang} code={code} />;
        }
        const t = p.replace(/^\n+|\n+$/g, "");
        return t ? <Text key={i} text={t} /> : null;
      })}
    </>
  );
}

export default function Home() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState(false);
  const [model, setModel] = useState("gemma");
  useEffect(() => {
    setDebug(new URLSearchParams(location.search).has("debug"));
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);
    const t0 = Date.now();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(debug ? { message: text, model } : { message: text }),
      });
      const data = (await res.json()) as { reply?: string; error?: string; model?: string; ms?: number; cached?: boolean };
      const total = ((Date.now() - t0) / 1000).toFixed(1);
      const meta = debug
        ? `${data.model ?? "—"} · مدل: ${data.ms ? (data.ms / 1000).toFixed(1) + "s" : data.cached ? "کش" : "بدون مدل"} · کل: ${total}s`
        : undefined;
      setMsgs((m) => [...m, { role: "bot", text: data.reply || data.error || "خطا", meta }]);
    } catch {
      setMsgs((m) => [...m, { role: "bot", text: "اتصال برقرار نشد. دوباره تلاش کن." }]);
    }
    setLoading(false);
  }

  return (
    <main className="wrap">
      <h1>دستیار هوشمند</h1>
      <div className="msgs">
        {msgs.length === 0 && <div className="msg bot">سلام! سوالت رو بپرس.</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <Body text={m.text} />
            {m.meta && <div className="meta" dir="ltr">{m.meta}</div>}
          </div>
        ))}
        {loading && <div className="msg bot">در حال نوشتن…</div>}
      </div>
      {debug && (
        <select className="modelSel" value={model} onChange={(e) => setModel(e.target.value)}>
          {MODEL_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )}
      <div className="row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="پیامت رو بنویس"
        />
        <button onClick={send} disabled={loading}>ارسال</button>
      </div>
    </main>
  );
}
