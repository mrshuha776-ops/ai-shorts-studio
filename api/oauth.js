import crypto from "node:crypto";

const ORIGIN = "https://ai-shorts-studio-rust.vercel.app";
const RESOURCE = ORIGIN + "/mcp";
const ISSUER = ORIGIN;
const BAZAAI_BASE = "https://api.baza-ai.org/v1";

function b64u(input) {
  return Buffer.from(input).toString("base64url");
}
function unb64u(input) {
  return Buffer.from(input, "base64url");
}
function secretKey() {
  const secret = String(process.env.MCP_AUTH_SECRET || "");
  if (!secret) throw new Error("MCP_AUTH_SECRET is not configured");
  return crypto.createHash("sha256").update(secret).digest();
}
function seal(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, body].map(b => b.toString("base64url")).join(".");
}
function open(token) {
  const [ivB64, tagB64, bodyB64] = String(token).split(".");
  if (!ivB64 || !tagB64 || !bodyB64) throw new Error("invalid_token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), unb64u(ivB64));
  decipher.setAuthTag(unb64u(tagB64));
  const body = Buffer.concat([
    decipher.update(unb64u(bodyB64)),
    decipher.final()
  ]);
  return JSON.parse(body.toString("utf8"));
}
function challenge(verifier) {
  return b64u(crypto.createHash("sha256").update(verifier).digest());
}
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
function form(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", c => {
      raw += c;
      if (raw.length > 100000) reject(new Error("request too large"));
    });
    req.on("end", () => resolve(new URLSearchParams(raw)));
    req.on("error", reject);
  });
}
function allowedRedirect(uri) {
  return uri === "https://chatgpt.com/connector_platform_oauth_redirect" ||
    /^https:\/\/chatgpt\.com\/connector\/oauth\/[^/?#]+$/.test(uri);
}
function htmlEscape(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
async function validateBazaKey(key) {
  const r = await fetch(BAZAAI_BASE + "/models", {
    headers: { Authorization: "Bearer " + key }
  });
  if (!r.ok) return false;
  return true;
}

export default async function handler(req, res) {
  const url = new URL(req.url, ORIGIN);
  res.setHeader("Cache-Control", "no-store");

  if (url.pathname === "/.well-known/oauth-protected-resource") {
    return json(res, 200, {
      resource: RESOURCE,
      authorization_servers: [ISSUER],
      scopes_supported: ["bazaai.use"]
    });
  }

  if (url.pathname === "/.well-known/oauth-authorization-server") {
    return json(res, 200, {
      issuer: ISSUER,
      authorization_response_iss_parameter_supported: true,
      authorization_endpoint: ISSUER + "/oauth/authorize",
      token_endpoint: ISSUER + "/oauth/token",
      client_id_metadata_document_supported: true,
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["bazaai.use"]
    });
  }

  if (url.pathname === "/oauth/authorize" && req.method === "GET") {
    const p = url.searchParams;
    const clientId = p.get("client_id") || "";
    const redirectUri = p.get("redirect_uri") || "";
    const codeChallenge = p.get("code_challenge") || "";
    const method = p.get("code_challenge_method") || "";
    const state = p.get("state") || "";
    const resource = p.get("resource") || RESOURCE;
    if (!clientId || !redirectUri || !codeChallenge || method !== "S256" ||
        resource !== RESOURCE || !allowedRedirect(redirectUri)) {
      return json(res, 400, { error: "invalid_request", error_description: "Invalid OAuth authorization request." });
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect BazaAI</title>
<style>body{font-family:system-ui;max-width:520px;margin:40px auto;padding:20px}input,button{width:100%;box-sizing:border-box;padding:13px;margin-top:10px}button{font-weight:700}</style>
</head><body>
<h2>Connect BazaAI to ChatGPT</h2>
<p>Enter your BazaAI API key. It is sent only to this secure bridge and is never placed in the ChatGPT message.</p>
<form method="post" action="/oauth/authorize">
<input type="hidden" name="client_id" value="${htmlEscape(clientId)}">
<input type="hidden" name="redirect_uri" value="${htmlEscape(redirectUri)}">
<input type="hidden" name="code_challenge" value="${htmlEscape(codeChallenge)}">
<input type="hidden" name="state" value="${htmlEscape(state)}">
<input type="hidden" name="resource" value="${htmlEscape(resource)}">
<label>BazaAI API key</label>
<input name="baza_key" type="password" autocomplete="off" required placeholder="ks_live_...">
<button type="submit">Connect BazaAI</button>
</form>
<p>Do not paste the key into ChatGPT chat.</p>
</body></html>`);
  }

  if (url.pathname === "/oauth/authorize" && req.method === "POST") {
    try {
      const p = await form(req);
      const clientId = p.get("client_id") || "";
      const redirectUri = p.get("redirect_uri") || "";
      const codeChallenge = p.get("code_challenge") || "";
      const state = p.get("state") || "";
      const resource = p.get("resource") || "";
      const bazaKey = String(p.get("baza_key") || "").trim();

      if (!clientId || !allowedRedirect(redirectUri) || resource !== RESOURCE ||
          !codeChallenge || !bazaKey) {
        return json(res, 400, { error: "invalid_request" });
      }

      if (!(await validateBazaKey(bazaKey))) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.end("<h3>Invalid BazaAI API key</h3><p>Go back and try again.</p>");
      }

      const code = seal({
        typ: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        resource: RESOURCE,
        baza_key: bazaKey,
        exp: Math.floor(Date.now() / 1000) + 600
      });

      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      if (state) target.searchParams.set("state", state);
      target.searchParams.set("iss", ISSUER);
      res.statusCode = 302;
      res.setHeader("Location", target.toString());
      return res.end();
    } catch (e) {
      return json(res, 500, { error: "server_error", error_description: "Authorization failed." });
    }
  }

  if (url.pathname === "/oauth/token" && req.method === "POST") {
    try {
      const p = await form(req);
      const grantType = p.get("grant_type") || "";
      const clientId = p.get("client_id") || "";

      if (grantType === "authorization_code") {
        const code = p.get("code") || "";
        const verifier = p.get("code_verifier") || "";
        const redirectUri = p.get("redirect_uri") || "";
        const payload = open(code);
        const now = Math.floor(Date.now() / 1000);
        if (payload.typ !== "code" || payload.exp < now ||
            payload.client_id !== clientId ||
            payload.redirect_uri !== redirectUri ||
            challenge(verifier) !== payload.code_challenge ||
            payload.resource !== RESOURCE) {
          return json(res, 400, { error: "invalid_grant" });
        }

        const access = seal({
          typ: "access",
          client_id: clientId,
          resource: RESOURCE,
          baza_key: payload.baza_key,
          exp: now + 3600
        });
        const refresh = seal({
          typ: "refresh",
          client_id: clientId,
          resource: RESOURCE,
          baza_key: payload.baza_key,
          exp: now + 30 * 24 * 3600
        });

        return json(res, 200, {
          access_token: access,
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: refresh,
          scope: "bazaai.use"
        });
      }

      if (grantType === "refresh_token") {
        const refresh = p.get("refresh_token") || "";
        const payload = open(refresh);
        const now = Math.floor(Date.now() / 1000);
        if (payload.typ !== "refresh" || payload.exp < now ||
            payload.client_id !== clientId || payload.resource !== RESOURCE) {
          return json(res, 400, { error: "invalid_grant" });
        }

        const access = seal({
          typ: "access",
          client_id: clientId,
          resource: RESOURCE,
          baza_key: payload.baza_key,
          exp: now + 3600
        });
        const nextRefresh = seal({
          typ: "refresh",
          client_id: clientId,
          resource: RESOURCE,
          baza_key: payload.baza_key,
          exp: now + 30 * 24 * 3600
        });
        return json(res, 200, {
          access_token: access,
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: nextRefresh,
          scope: "bazaai.use"
        });
      }

      return json(res, 400, { error: "unsupported_grant_type" });
    } catch {
      return json(res, 400, { error: "invalid_grant" });
    }
  }

  return json(res, 404, { error: "not_found" });
}
