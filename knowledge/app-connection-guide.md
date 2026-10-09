keywords: اتصال, وصل, اپلیکیشن, اپ, api, ای پی آی, آدرس, درخواست, connect, integration, endpoint, fetch, cors
How to connect an app to Orbix AI:
Send a POST request to <YOUR_DEPLOYED_URL>/api/chat with header Content-Type: application/json and body {"message": "your text"}.
Success response: {"reply": "..."} (may include "cached": true). Error response: {"error": "..."}.
Limits: message max 1000 characters, short replies. CORS is open, so any website can call it directly.
Example (HTML/JS):
const r = await fetch("https://orbixaillm.harmoniomaster.workers.dev/api/chat", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({message: text})});
const data = await r.json(); console.log(data.reply || data.error);
