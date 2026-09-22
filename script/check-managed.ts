#!/usr/bin/env bun
// Checks a managed config before it is deployed to every machine.
//
//   bun run script/check-managed.ts [path]      default: managed/simplify-code.jsonc
//
// Exit 0: deployable. Exit 1: problems listed, do not deploy.
import { readFileSync } from "node:fs"
import path from "node:path"
import { lintManagedConfig } from "../src/managed"

const file = process.argv[2] ?? path.resolve(import.meta.dir, "../managed/simplify-code.jsonc")
const problems = lintManagedConfig(readFileSync(file, "utf8"))
if (problems.length === 0) {
  console.log(`${file}: ok, deployable`)
  process.exit(0)
}
console.error(`${file}: ${problems.length} problem(s), do not deploy\n`)
for (const p of problems) console.error(`  - ${p}`)
process.exit(1)
