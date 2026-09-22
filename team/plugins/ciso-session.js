// ciso-session.js — opencode plugin: mints a CISO Session ID at session start,
// giving opencode sessions the same commit-trailer governance Claude Code
// sessions already have (backlog #12).
//
// Contract mirrored from integration/ciso_session_client.py:
//   POST ${CISO_API_BASE}/sessions (default http://127.0.0.1:8099) with JSON
//   {org, team, trust_tier, developer_id} and header X-CISO-Api-Key (omitted
//   if CISO_API_KEY is unset), 10s timeout. Response {"session_id": "..."}.
//   The id is written atomically to CISO_ACTIVE_SESSION_FILE (default
//   ~/.claude/active_session) — CISO's existing repo-level commit-msg hook
//   reads that file, so zero CISO-side changes are needed.
//
// CONTRACT-ONLY RE-DECLARATION #3: the session-id regex below is a third
// independent copy of ciso/core/sessionid.py's pattern, alongside
// integration/ciso_session_client.py (SESSION_ID_RE) and
// integration/ciso_export.py (imports that same constant). Change all three
// together.
//
// Two notes for whoever wires this up at live rollout:
//  (a) HOOK-NAME SHAPE: this registers the named hook "session.created" per
//      the opencode plugin docs pattern as of 2026-08. Re-verify the hook
//      name/signature against the *installed* opencode version before
//      relying on this in production — the plugin API was not stable enough
//      to treat this as guaranteed.
//  (b) FAIL-OPEN IS IMPLEMENTED HERE, not assumed from the host. The docs do
//      not specify whether a thrown handler error crashes opencode, so the
//      entire handler body below is wrapped in one try/catch that never
//      rethrows — nothing in this plugin may ever throw out of the hook.
//
// Idempotency: if opencode fires "session.created" more than once in a
// process (e.g. session resume), re-minting on each call is acceptable —
// last write wins, and the atomic rename means readers never see a torn file.

import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";

import { getDeveloperId as defaultGetDeveloperId } from "./entra-identity.js";

// Re-declaration of ciso/core/sessionid.py's _PATTERN — never imported, per
// the contract-only coupling this file follows (see header comment above).
export const SESSION_ID_RE =
  /^CC-[A-Z]{2,10}-[A-Z]{2,20}-\d{8}T\d{4}-[0-9a-f]{6}$/;

export function isValidSessionId(id) {
  return typeof id === "string" && SESSION_ID_RE.test(id);
}

export function buildPayload(env) {
  return {
    org: env.CISO_ORG,
    team: env.CISO_TEAM,
    trust_tier: parseInt(env.CISO_TRUST_TIER ?? "2", 10),
    developer_id: env.CISO_DEVELOPER_ID || os.userInfo().username,
  };
}

// Atomic write: temp file in the same directory, then rename, so a reader
// (CISO's commit-msg hook) never observes a partial write.
export async function writeActiveSession(id, filePath) {
  const target =
    filePath || path.join(os.homedir(), ".claude", "active_session");
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await fs.writeFile(tmp, id, "utf8");
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

async function mintSessionId(payload, apiBase, apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["X-CISO-Api-Key"] = apiKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${apiBase}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`CISO /sessions returned HTTP ${res.status}`);
    }
    const body = await res.json();
    const id = body && body.session_id;
    if (!isValidSessionId(id)) {
      throw new Error(
        `CISO /sessions returned an id that fails SESSION_ID_RE: ${JSON.stringify(id)}`,
      );
    }
    return id;
  } finally {
    clearTimeout(timer);
  }
}

// The opencode plugin export: an async function receiving the plugin
// context, returning a hooks object keyed by hook name. `deps.getDeveloperId`
// is injectable for tests (mirrors ado_transport.py's token_client injection
// pattern in rollout-platform); production callers omit it and get the real
// Entra-backed implementation from entra-identity.js.
export async function CisoSessionPlugin(_ctx, deps = {}) {
  const getDeveloperId = deps.getDeveloperId || defaultGetDeveloperId;
  return {
    "session.created": async (_input) => {
      try {
        const env = process.env;
        if (!env.CISO_ORG || !env.CISO_TEAM) {
          console.debug(
            "ciso-session: CISO_ORG/CISO_TEAM unset — session not governed",
          );
          return;
        }

        // Silent-only Entra resolution. Pass `null` as the fallback (rather
        // than pre-computing CISO_DEVELOPER_ID-or-OS-username here) so
        // buildPayload() stays the single owner of that fallback rule --
        // duplicating it here could silently desync from buildPayload()'s
        // own `env.CISO_DEVELOPER_ID || os.userInfo().username` expression.
        // When Entra resolution fails or isn't configured, getDeveloperId()
        // returns `null` (its fallback, unchanged) per entra-identity.js's
        // own contract, so payloadEnv stays the original `env` and
        // buildPayload()'s existing fallback chain runs untouched.
        const entraId = await getDeveloperId(null, env);
        const payloadEnv = entraId ? { ...env, CISO_DEVELOPER_ID: entraId } : env;

        const payload = buildPayload(payloadEnv);
        const apiBase = env.CISO_API_BASE || "http://127.0.0.1:8099";
        const apiKey = env.CISO_API_KEY || "";

        const id = await mintSessionId(payload, apiBase, apiKey);
        await writeActiveSession(id, env.CISO_ACTIVE_SESSION_FILE);
        console.log(`ciso-session: minted ${id}`);
      } catch (err) {
        // Never rethrow: this plugin must fail open, always.
        console.error(
          `ciso-session: mint failed (fail-open): ${err && err.message ? err.message : err}`,
        );
      }
    },
  };
}

export default CisoSessionPlugin;
