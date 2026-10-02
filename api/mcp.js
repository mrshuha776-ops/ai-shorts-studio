const DEFAULT_BASE = "https://api.baza-ai.org/v1";

function json(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

function rpc(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function error(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function bearer(req) {
  const value = String(req.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; if (raw.length > 2_000_000) reject(new Error("Request too large")); });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

async function bazaai(path, init, token) {
  const base = String(process.env.BAZAAI_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
  const response = await fetch(base + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      Authorization: "Bearer " + token
    }
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 4000) }; }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `BazaAI returned HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return data;
}

const tools = [
  {
    name: "bazaai_chat",
    description: "Send a coding or general AI request to BazaAI through its OpenAI-compatible API. Useful for second-opinion code review, debugging, refactoring, and comparing solutions.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The task or question for BazaAI." },
        model: { type: "string", description: "Optional BazaAI model name. If omitted, the provider default is used." },
        system: { type: "string", description: "Optional system instruction." }
      },
      required: ["message"],
      additionalProperties: false
    }
  },
  {
    name: "bazaai_models",
    description: "List models available through the configured BazaAI API key.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  }
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, mcp-session-id");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return json(res, 200, { ok: true, name: "BazaAI MCP Bridge", endpoint: "/mcp" });

  if (req.method !== "POST") return json(res, 405, { error: "POST required" });

  // The same Bearer token is forwarded to BazaAI. Do not hard-code API keys in source.
  const token = bearer(req);
  if (!token) return json(res, 401, { error: "Authorization: Bearer <BazaAI API key> is required" });

  let body;
  try { body = await readBody(req); }
  catch (e) { return json(res, 400, { error: e.message }); }

  const id = body?.id ?? null;
  const method = body?.method;
  const params = body?.params || {};

  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return res.status(202).end();
  }

  if (method === "initialize") {
    return json(res, 200, rpc(id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "bazaai-mcp-bridge", version: "1.0.0" },
      instructions: "Use bazaai_chat when a second AI opinion or BazaAI-powered coding/debugging is useful. Never expose API keys."
    }));
  }

  if (method === "tools/list") {
    return json(res, 200, rpc(id, { tools }));
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments || {};

    try {
      if (name === "bazaai_models") {
        const data = await bazaai("/models", { method: "GET", headers: { "Content-Type": "application/json" } }, token);
        return json(res, 200, rpc(id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data
        }));
      }

      if (name === "bazaai_chat") {
        const message = String(args.message || "").trim();
        if (!message) return json(res, 200, rpc(id, { isError: true, content: [{ type: "text", text: "message is required" }] }));

        const messages = [];
        if (args.system) messages.push({ role: "system", content: String(args.system).slice(0, 12000) });
        messages.push({ role: "user", content: message.slice(0, 30000) });

        const payload = { messages };
        if (args.model) payload.model = String(args.model);

        const data = await bazaai("/chat/completions", {
          method: "POST",
          body: JSON.stringify(payload)
        }, token);

        const text = data?.choices?.[0]?.message?.content ?? JSON.stringify(data, null, 2);
        return json(res, 200, rpc(id, {
          content: [{ type: "text", text: String(text) }],
          structuredContent: { response: data }
        }));
      }

      return json(res, 200, rpc(id, {
        isError: true,
        content: [{ type: "text", text: "Unknown tool: " + String(name) }]
      }));
    } catch (e) {
      return json(res, 200, rpc(id, {
        isError: true,
        content: [{ type: "text", text: e?.message || "BazaAI request failed" }]
      }));
    }
  }

  if (method === "ping") return json(res, 200, rpc(id, {}));

  return json(res, 200, error(id, -32601, "Method not found: " + String(method)));
}
