#!/usr/bin/env bun
// Vendors superpowers (https://github.com/obra/superpowers, MIT) into the team folder so it ships inside
// the app instead of being fetched from GitHub on every machine's first launch.
//
//   bun run script/vendor-superpowers.ts v6.3.0
//
// Its OpenCode plugin (.opencode/plugins/superpowers.js) depends only on Node built-ins and finds its
// skills at ../../skills relative to itself, so the package is copied whole (plugin, skills, licence)
// to team/vendor/superpowers/ and a one-line shim in team/plugins/ re-exports the plugin, which the app
// auto-discovers. Re-run with a newer tag to update; both places are replaced wholesale.
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { TEAM_DIR } from "../src/team-bundle"

const tag = process.argv[2]
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error("usage: bun run script/vendor-superpowers.ts vX.Y.Z   (a release tag of obra/superpowers)")
  process.exit(1)
}

const work = mkdtempSync(path.join(tmpdir(), "superpowers-"))
try {
  console.log(`cloning obra/superpowers at ${tag}`)
  await $`git clone -q --depth 1 --branch ${tag} https://github.com/obra/superpowers.git ${work}`
  for (const rel of [".opencode/plugins/superpowers.js", "skills/using-superpowers/SKILL.md", "LICENSE"]) {
    if (!existsSync(path.join(work, rel))) throw new Error(`superpowers has no ${rel}; its layout changed`)
  }

  const dest = path.join(TEAM_DIR, "vendor", "superpowers")
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(path.join(dest, ".opencode", "plugins"), { recursive: true })
  cpSync(path.join(work, ".opencode", "plugins", "superpowers.js"), path.join(dest, ".opencode", "plugins", "superpowers.js"))
  cpSync(path.join(work, "skills"), path.join(dest, "skills"), { recursive: true })
  cpSync(path.join(work, "LICENSE"), path.join(dest, "LICENSE"))
  writeFileSync(
    path.join(dest, "VENDORED.md"),
    `Vendored from https://github.com/obra/superpowers at tag ${tag} by script/vendor-superpowers.ts.\nMIT; see LICENSE here. Only the OpenCode plugin and the skills are kept. Do not edit; re-run the script with a newer tag to update.\n`,
  )
  writeFileSync(
    path.join(TEAM_DIR, "plugins", "superpowers.js"),
    `// Auto-discovered by the app. superpowers itself lives in ../vendor/superpowers (see VENDORED.md there);\n// its plugin locates its skills relative to its own file, so it must stay in that layout.\nexport { SuperpowersPlugin } from "../vendor/superpowers/.opencode/plugins/superpowers.js"\n`,
  )
  console.log(`vendored ${tag}: ${path.relative(process.cwd(), dest)}, team/plugins/superpowers.js`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
