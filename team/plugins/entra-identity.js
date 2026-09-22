// entra-identity.js — opencode plugin: silent-only Entra ID token
// acquisition for developer identity attribution.
//
// Called by ciso-session.js's "session.created" hook before POSTing to
// CISO's /sessions endpoint. SILENT ONLY: this module never prompts
// interactively. An interactive device-code sign-in requires a human to
// open a browser -- routinely tens of seconds -- and running that inside a
// session-start hook would hang every session on a prompt nobody asked for.
// The one-time interactive flow lives in entra-signin.mjs, run manually once
// during onboarding, and populates the same on-disk cache this file reads.
//
// Fail-open, unconditionally: getDeveloperId() never throws. Any failure --
// not configured, @azure/msal-node not installed, network error, expired
// refresh token, malformed response -- resolves to `fallback` unchanged.
//
// See docs/superpowers/specs/2026-08-31-entra-verified-developer-identity-design.md
// (ciso-governance repo) for the full design.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const DEFAULT_CACHE_PATH = path.join(os.homedir(), ".config", "opencode", "entra_token_cache.bin");
export const DEFAULT_SCOPES = ["openid", "profile", "email"];

export function cachePath(env) {
  return env.CISO_ENTRA_TOKEN_CACHE_FILE || DEFAULT_CACHE_PATH;
}

// msal-node has no built-in file cache -- it calls these two hooks around
// every cache-touching operation. beforeCacheAccess only ever hands the raw
// file bytes to MSAL's own deserialize(); this code never extracts an
// identity from the file content itself (see the "never read as a bare
// identity string" test).
export function buildCachePlugin(filePath) {
  return {
    beforeCacheAccess: async (cacheContext) => {
      try {
        const data = await fs.readFile(filePath, "utf8");
        cacheContext.tokenCache.deserialize(data);
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
        // no cache yet -- MSAL starts from an empty cache
      }
    },
    afterCacheAccess: async (cacheContext) => {
      if (!cacheContext.cacheHasChanged) return;
      const dir = path.dirname(filePath);
      // 0o700/0o600: this file holds a real Entra refresh token -- default
      // umask (commonly 022) would otherwise leave it world-readable.
      // fs.writeFile's `mode` only applies when the file is created (true
      // here -- `tmp` is a fresh path each call), and fs.rename preserves
      // the source file's mode, so setting it once on the temp file's
      // creation is sufficient (see the "0600" mode test in entra-identity.test.mjs).
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const tmp = `${filePath}.tmp-${process.pid}`;
      await fs.writeFile(tmp, cacheContext.tokenCache.serialize(), { encoding: "utf8", mode: 0o600 });
      await fs.rename(tmp, filePath);
    },
  };
}

function claimToDeveloperId(claims) {
  if (!claims) return null;
  return claims.preferred_username || claims.email || null;
}

function isTruthyEnv(value) {
  const v = (value || "").toLowerCase();
  return v === "1" || v === "true";
}

// `env` is passed explicitly (not read from process.env internally) so
// callers/tests control it precisely, matching buildPayload's existing
// convention in ciso-session.js. `msalModule` defaults to a real dynamic
// import of @azure/msal-node; tests inject a fake.
export async function getDeveloperId(fallback, env, msalModule) {
  if (isTruthyEnv(env.CISO_SKIP_ENTRA_IDENTITY)) {
    return fallback;
  }
  const clientId = env.CISO_ENTRA_CLIENT_ID;
  const tenantId = env.CISO_ENTRA_TENANT_ID;
  if (!clientId || !tenantId) {
    return fallback; // this developer machine isn't configured for Entra identity yet
  }

  let msal = msalModule;
  if (msal === undefined) {
    try {
      msal = await import("@azure/msal-node");
    } catch (err) {
      console.error(`ciso-session: @azure/msal-node not installed -- Entra identity check skipped: ${err.message}`);
      return fallback;
    }
  }

  try {
    const pca = new msal.PublicClientApplication({
      auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}` },
      cache: { cachePlugin: buildCachePlugin(cachePath(env)) },
    });

    const accounts = await pca.getTokenCache().getAllAccounts();
    if (!accounts || accounts.length === 0) return fallback;

    const result = await pca.acquireTokenSilent({ scopes: DEFAULT_SCOPES, account: accounts[0] });
    if (!result) return fallback;

    return claimToDeveloperId(result.idTokenClaims) || fallback;
  } catch (err) {
    console.error(`ciso-session: Entra silent acquisition failed (fail-open): ${err && err.message ? err.message : err}`);
    return fallback;
  }
}
