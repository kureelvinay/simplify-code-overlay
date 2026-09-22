#!/usr/bin/env bun
// Vendors impeccable (https://github.com/pbakaus/impeccable, Apache-2.0) into the team folder, using
// its own OpenCode build rather than copying Claude Code files by hand.
//
//   bun run script/vendor-impeccable.ts skill-v4.1.3
//
// Puts the built skill at team/skills/impeccable/ (with the upstream LICENSE and NOTICE.md beside
// SKILL.md, so they travel with it) and the command at team/commands/impeccable.md. Re-run with a
// newer tag to update; both places are replaced wholesale.
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { TEAM_DIR } from "../src/team-bundle"

const tag = process.argv[2]
if (!tag || !/^skill-v\d+\.\d+\.\d+$/.test(tag)) {
  console.error("usage: bun run script/vendor-impeccable.ts skill-vX.Y.Z   (a release tag of pbakaus/impeccable)")
  process.exit(1)
}

const work = mkdtempSync(path.join(tmpdir(), "impeccable-"))
try {
  console.log(`cloning pbakaus/impeccable at ${tag}`)
  await $`git clone -q --depth 1 --branch ${tag} https://github.com/pbakaus/impeccable.git ${work}`
  console.log("building its OpenCode distribution")
  await $`bun install --frozen-lockfile`.cwd(work).quiet()
  await $`bun run build:skills`.cwd(work).quiet()

  const built = path.join(work, "dist", "opencode", ".opencode")
  for (const rel of ["skills/impeccable/SKILL.md", "commands/impeccable.md"]) {
    if (!existsSync(path.join(built, rel))) throw new Error(`impeccable's OpenCode build has no ${rel}; its layout changed`)
  }

  const skillDest = path.join(TEAM_DIR, "skills", "impeccable")
  rmSync(skillDest, { recursive: true, force: true })
  cpSync(path.join(built, "skills", "impeccable"), skillDest, { recursive: true })
  for (const f of ["LICENSE", "NOTICE.md"]) cpSync(path.join(work, f), path.join(skillDest, f))
  writeFileSync(
    path.join(skillDest, "VENDORED.md"),
    `Vendored from https://github.com/pbakaus/impeccable at tag ${tag} by script/vendor-impeccable.ts.\nApache-2.0; see LICENSE and NOTICE.md here. Do not edit; re-run the script with a newer tag to update.\n`,
  )
  cpSync(path.join(built, "commands", "impeccable.md"), path.join(TEAM_DIR, "commands", "impeccable.md"))
  console.log(`vendored ${tag}: ${path.relative(process.cwd(), skillDest)}, team/commands/impeccable.md`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
