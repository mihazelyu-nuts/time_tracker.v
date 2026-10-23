// Cloudflare Worker。/api/log だけを処理し、それ以外は study-log-deploy/index.html をそのまま返す。
// KV は wrangler.jsonc の kv_namespaces で STUDY_KV として結び付けている。
const OK = /^[a-f0-9]{32,64}$/;
const J = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});
// マイリンクの鍵そのものは保存せず、ハッシュ化したものをKVのキーにする
async function uid(k) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(k));
  return "u:" + Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join("");
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/log") return env.ASSETS.fetch(request);
    if (!env.STUDY_KV) return J({ error: "KV is not bound" }, 500);

    if (request.method === "GET") {
      const k = url.searchParams.get("k") || "";
      if (!OK.test(k)) return J({ error: "bad key" }, 400);
      const v = await env.STUDY_KV.get(await uid(k));
      return J(v ? JSON.parse(v) : {});
    }
    if (request.method === "PUT") {
      const raw = await request.text();
      if (raw.length > 1000000) return J({ error: "too large" }, 413);
      let b;
      try { b = JSON.parse(raw); } catch { return J({ error: "bad json" }, 400); }
      if (!OK.test(b.k || "") || !Array.isArray(b.sessions)) return J({ error: "bad request" }, 400);
      await env.STUDY_KV.put(await uid(b.k), JSON.stringify({
        sessions: b.sessions.slice(0, 20000),
        goal: Math.max(0, +b.goal || 0),
        updated: Date.now(),
      }));
      return J({ ok: true });
    }
    return J({ error: "method not allowed" }, 405);
  },
};
