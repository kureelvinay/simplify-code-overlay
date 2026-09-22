#!/usr/bin/env node
// entra-signin.mjs — one-time interactive Entra ID device-code sign-in for
// opencode. Run manually once, during onboarding:
//   node ~/.config/opencode/plugins/entra-signin.mjs
//
// Populates the same on-disk token cache entra-identity.js's getDeveloperId()
// reads SILENTLY on every subsequent opencode session start. This script is
// never invoked automatically -- ciso-session.js's "session.created" hook
// only ever attempts silent acquisition, because an interactive browser
// prompt cannot complete inside a plugin hook without blocking every future
// session start on it (see entra-identity.js's own header comment).
import { pathToFileURL } from "node:url";
import { PublicClientApplication } from "@azure/msal-node";
import { cachePath, buildCachePlugin, DEFAULT_SCOPES } from "./entra-identity.js";

async function main() {
  const clientId = process.env.CISO_ENTRA_CLIENT_ID;
  const tenantId = process.env.CISO_ENTRA_TENANT_ID;
  if (!clientId || !tenantId) {
    console.error(
      "CISO_ENTRA_CLIENT_ID / CISO_ENTRA_TENANT_ID not set -- your team lead " +
      "sets these alongside CISO_ORG/CISO_TEAM (see docs/onboarding.md). " +
      "Source your shell profile, or ask your team lead to confirm they're set.",
    );
    process.exit(1);
  }

  const pca = new PublicClientApplication({
    auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}` },
    cache: { cachePlugin: buildCachePlugin(cachePath(process.env)) },
  });

  const result = await pca.acquireTokenByDeviceCode({
    scopes: DEFAULT_SCOPES,
    deviceCodeCallback: (response) => console.log(response.message),
  });

  if (!result || !result.account) {
    console.error("Sign-in did not complete.");
    process.exit(1);
  }
  console.log(`Signed in as ${result.account.username}. Future opencode sessions will use this identity automatically.`);
}

// Only run when this file is executed directly (`node entra-signin.mjs`),
// never when merely imported/scanned by a plugin loader — see the CRITICAL
// finding in the final whole-branch review: this file lives in the same
// directory opencode auto-loads plugins from, and importing it must never
// have side effects (let alone process.exit) or opencode itself could fail
// to start for every developer who hasn't configured Entra yet.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`Sign-in failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  });
}
