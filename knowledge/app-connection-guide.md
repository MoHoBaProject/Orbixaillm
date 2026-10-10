keywords: api, ای پی آی, اپی آی, endpoint, fetch, cors, html, درخواست api, وب سرویس
How to connect your own website or app to the Orbix AI assistant API:
Send a POST request to https://orbixaillm.harmoniomaster.workers.dev/api/chat with header Content-Type: application/json and body {"message": "your text"}.
Success response: {"reply": "..."} (may include "cached": true). Error response: {"error": "..."}.
Limits: message max 1000 characters. CORS is open, so any website can call it directly.
Example (HTML/JS):
const r = await fetch("https://orbixaillm.harmoniomaster.workers.dev/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({message: text})});
const data = await r.json(); console.log(data.reply || data.error);
