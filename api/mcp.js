import crypto from "node:crypto";

const DEFAULT_BASE = "https://api.baza-ai.org/v1";
const ORIGIN = "https://ai-shorts-studio-rust.vercel.app";
const RESOURCE = ORIGIN + "/mcp";

function json(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}
function rpc(id, result) { return { jsonrpc: "2.0", id, result }; }
function error(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }
function bearer(req) {
  const value = String(req.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}
function secretKey() {
  const secret = String(process.env.MCP_AUTH_SECRET || "");
  if (!secret) throw new Error("MCP_AUTH_SECRET is not configured");
  return crypto.createHash("sha256").update(secret).digest();
}
function unb64u(input) { return Buffer.from(input, "base64url"); }
function openToken(token) {
  const [ivB64, tagB64, bodyB64] = String(token).split(".");
  if (!ivB64 || !tagB64 || !bodyB64) throw new Error("invalid_token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), unb64u(ivB64));
  decipher.setAuthTag(unb64u(tagB64));
  const body = Buffer.concat([decipher.update(unb64u(bodyB64)), decipher.final()]);
  const payload = JSON.parse(body.toString("utf8"));
  if (payload.typ !== "access" || payload.resource !== RESOURCE ||
      !payload.baza_key || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("invalid_token");
  }
  return payload;
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

const auth = { type: "oauth2", scopes: ["bazaai.use"] };
const tools = [
  {
    name: "bazaai_chat",
    description: "Use BazaAI for a second AI opinion, coding, debugging, refactoring, or general AI work when the user asks for BazaAI.",
    securitySchemes: [auth],
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The task or question for BazaAI." },
        model: { type: "string", description: "Optional BazaAI model name." },
        system: { type: "string", description: "Optional system instruction." }
      },
      required: ["message"],
      additionalProperties: false
    }
  },
  {
    name: "bazaai_models",
    description: "List models available through the connected BazaAI API key.",
    securitySchemes: [auth],
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  }
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, mcp-session-id");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return json(res, 200, { ok: true, name: "BazaAI MCP Bridge", endpoint: "/mcp", auth: "OAuth 2.1" });
  if (req.method !== "POST") return json(res, 405, { error: "POST required" });

  let authPayload;
  try {
    authPayload = openToken(bearer(req));
  } catch {
    const metadata = ORIGIN + "/.well-known/oauth-protected-resource";
    return json(res, 401, { error: "unauthorized", error_description: "Connect BazaAI first." }, {
      "WWW-Authenticate": `Bearer resource_metadata="${metadata}", scope="bazaai.use"`
    });
  }
  const token = authPayload.baza_key;

  let body;
  try { body = await readBody(req); }
  catch (e) { return json(res, 400, { error: e.message }); }

  const id = body?.id ?? null;
  const method = body?.method;
  const params = body?.params || {};

  if (method === "notifications/initialized" || method === "notifications/cancelled") return res.status(202).end();

  if (method === "initialize") {
    return json(res, 200, rpc(id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "bazaai-mcp-bridge", version: "2.0.0" },
      instructions: "Use BazaAI tools when the user explicitly asks for BazaAI or a BazaAI second opinion. Never expose API keys."
    }));
  }
  if (method === "tools/list") return json(res, 200, rpc(id, { tools }));

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments || {};
    try {
      if (name === "bazaai_models") {
        const data = await bazaai("/models", { method: "GET" }, token);
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
        const data = await bazaai("/chat/completions", { method: "POST", body: JSON.stringify(payload) }, token);
        const text = data?.choices?.[0]?.message?.content ?? JSON.stringify(data, null, 2);
        return json(res, 200, rpc(id, {
          content: [{ type: "text", text: String(text) }],
          structuredContent: { response: data }
        }));
      }
      return json(res, 200, rpc(id, { isError: true, content: [{ type: "text", text: "Unknown tool: " + String(name) }] }));
    } catch (e) {
      return json(res, 200, rpc(id, { isError: true, content: [{ type: "text", text: e?.message || "BazaAI request failed" }] }));
    }
  }
  if (method === "ping") return json(res, 200, rpc(id, {}));
  return json(res, 200, error(id, -32601, "Method not found: " + String(method)));
}
