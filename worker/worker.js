// my-projects-api — Cloudflare Worker for Reza's My Projects panel.
// KV binding: MY_PROJECTS. Secret: PANEL_PASSWORD (set via cf-projects.py secret-put).
// Every /api/* request except /api/health must carry
//   Authorization: Bearer <PANEL_PASSWORD>
// Data model (mirrors the in-app My Projects space):
//   project: { id, name, client, status, deliveryDate (Shamsi, e.g. ۱۴۰۵/۰۹/۰۴),
//              amount, settlement, nextStep,
//              tasks: [{id, text, done}], notes: [{id, text, createdAt}],
//              links: [{id, title, url}], createdAt, updatedAt }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nowIso() {
  return new Date().toISOString();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === "/" || url.pathname === "/api/health") {
      return json({ ok: true, service: "my-projects-api" });
    }

    if (!url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "not found" }, 404);
    }

    // --- auth (all /api/* except health) ---
    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!env.PANEL_PASSWORD || token !== env.PANEL_PASSWORD) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const kv = env.MY_PROJECTS;
    if (!kv) {
      return json({ ok: false, error: "kv binding missing" }, 500);
    }
    const key = (id) => `project:${id}`;

    // --- GET /api/projects : list all ---
    if (url.pathname === "/api/projects" && request.method === "GET") {
      const list = await kv.list({ prefix: "project:" });
      const out = [];
      for (const k of list.keys) {
        const p = await kv.get(k.name, "json");
        if (p) out.push(p);
      }
      out.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      return json({ ok: true, projects: out });
    }

    // --- POST /api/projects : create ---
    if (url.pathname === "/api/projects" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body.name !== "string" || !body.name.trim()) {
        return json({ ok: false, error: "name required" }, 400);
      }
      const id = uid();
      const p = {
        id,
        name: body.name.trim(),
        client: body.client || "",
        status: body.status || "جدید",
        deliveryDate: body.deliveryDate || "",
        amount: body.amount ?? "",
        settlement: body.settlement || "تسویه‌نشده",
        nextStep: body.nextStep || "",
        tasks: Array.isArray(body.tasks) ? body.tasks : [],
        notes: Array.isArray(body.notes) ? body.notes : [],
        links: Array.isArray(body.links) ? body.links : [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      await kv.put(key(id), JSON.stringify(p));
      return json({ ok: true, project: p }, 201);
    }

    // --- /api/projects/:id ---
    const m = url.pathname.match(/^\/api\/projects\/([A-Za-z0-9_-]+)$/);
    if (m) {
      const id = m[1];
      if (request.method === "GET") {
        const p = await kv.get(key(id), "json");
        if (!p) return json({ ok: false, error: "not found" }, 404);
        return json({ ok: true, project: p });
      }
      if (request.method === "PUT") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return json({ ok: false, error: "bad json" }, 400);
        }
        const p = await kv.get(key(id), "json");
        if (!p) return json({ ok: false, error: "not found" }, 404);
        const updated = {
          ...p,
          ...body,
          id: p.id,
          createdAt: p.createdAt,
          updatedAt: nowIso(),
        };
        await kv.put(key(id), JSON.stringify(updated));
        return json({ ok: true, project: updated });
      }
      if (request.method === "DELETE") {
        await kv.delete(key(id));
        return json({ ok: true });
      }
    }

    return json({ ok: false, error: "not found" }, 404);
  },
};
