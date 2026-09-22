#!/usr/bin/env bun
// Publishes a --package bundle as a GitHub Release.
//
//   bun run script/publish-bundle.ts --version 1.18.31 --repo owner/name [--bundle package|desktop|team] [--tag <tag>] [--target <branch-or-sha>]
//
// --bundle package (default) publishes dist/<v>/package as v<v>; --bundle desktop publishes dist/<v>/desktop as v<v>-desktop.
//
// Resumable: anything already uploaded with the right size is skipped, anything partial is replaced,
// so an interrupted run is finished by running it again. Needs a token with `repo` scope, from
// GH_TOKEN / GITHUB_TOKEN or, failing that, from git's own credential store (the same credential
// `git push` uses). The token is sent only to api.github.com and uploads.github.com and never printed.
import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { $ } from "bun"
import { loadBrand } from "../src/brand"
import { bundleDir, contentType, missingAssets, releaseNotes, releaseTag, releaseTitle, type BundleKind, type RemoteAsset } from "../src/publish"

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const version = arg("version")
const repo = arg("repo")
const target = arg("target")
const kind = (arg("bundle") ?? "package") as BundleKind
if (!version || !repo || !["package", "desktop", "team"].includes(kind)) {
  console.error("usage: bun run script/publish-bundle.ts --version X.Y.Z --repo owner/name [--bundle package|desktop|team] [--tag <tag>] [--target <branch-or-sha>]")
  process.exit(1)
}

const dir = bundleDir(path.resolve(import.meta.dir, ".."), version, kind)
if (!existsSync(path.join(dir, "SHA256SUMS"))) {
  console.error(`no bundle at ${dir}. Build it first: bun run src/pipeline.ts --${kind === "package" ? "package" : `${kind}-package`}${kind === "team" ? "" : ` --version ${version}`}`)
  process.exit(1)
}

async function token(): Promise<string> {
  const env = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
  if (env) return env
  const out = await $`git credential fill < ${new Response("protocol=https\nhost=github.com\n\n")}`.quiet().nothrow().text()
  const found = out.match(/^password=(.+)$/m)?.[1]
  if (!found) throw new Error("no GitHub token: set GH_TOKEN, or sign git in to github.com")
  return found
}

const auth = { Authorization: `Bearer ${await token()}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
const api = `https://api.github.com/repos/${repo}`
const brand = loadBrand()
const tag = arg("tag") ?? releaseTag(version, kind)

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)
  return (await res.json()) as T
}

interface Release {
  id: number
  html_url: string
  upload_url: string
  assets: RemoteAsset[]
}

let release: Release
const existing = await fetch(`${api}/releases/tags/${tag}`, { headers: auth })
if (existing.status === 404) {
  console.log(`creating release ${tag} on ${repo}${target ? ` at ${target}` : ""}`)
  release = await json<Release>(
    await fetch(`${api}/releases`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ tag_name: tag, target_commitish: target, name: releaseTitle(brand, version, kind), body: releaseNotes(brand, version, repo, kind, tag) }),
    }),
    "create release",
  )
} else {
  release = await json<Release>(existing, "read release")
  console.log(`release ${tag} already exists; resuming, and refreshing its title and notes`)
  // notes are generated from the brand and bundle kind; a re-run after a change must not leave stale text
  await json(
    await fetch(`${api}/releases/${release.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ name: releaseTitle(brand, version, kind), body: releaseNotes(brand, version, repo, kind, tag) }),
    }),
    "update release notes",
  )
}

const local = readdirSync(dir)
  .filter((name) => !name.startsWith(".") && statSync(path.join(dir, name)).isFile())
  .sort()
  .map((name) => ({ name, size: statSync(path.join(dir, name)).size }))
const plan = missingAssets(local, release.assets)
console.log(`${local.length} files in the bundle, ${local.length - plan.upload.length} already published, ${plan.upload.length} to upload`)

for (const stale of plan.replace) {
  const res = await fetch(`${api}/releases/assets/${stale.id}`, { method: "DELETE", headers: auth })
  if (!res.ok && res.status !== 404) throw new Error(`delete stale asset ${stale.name}: HTTP ${res.status}`)
}

const uploadBase = release.upload_url.replace(/\{.*$/, "")
const failed: string[] = []
const queue = [...plan.upload]
async function worker() {
  for (let asset = queue.shift(); asset; asset = queue.shift()) {
    const started = Date.now()
    try {
      const res = await fetch(`${uploadBase}?name=${encodeURIComponent(asset.name)}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": contentType(asset.name), "Content-Length": String(asset.size) },
        body: Bun.file(path.join(dir, asset.name)),
      })
      await json(res, `upload ${asset.name}`)
      console.log(`  uploaded ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(0)}s)`)
    } catch (e) {
      failed.push(asset.name)
      console.log(`  FAILED   ${asset.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
await Promise.all([worker(), worker(), worker()])

// Trust what GitHub now reports, not what we think we sent.
const final = await json<Release>(await fetch(`${api}/releases/tags/${tag}`, { headers: auth }), "re-read release")
const remaining = missingAssets(local, final.assets).upload.map((a) => a.name)
console.log(`\n${final.html_url}`)
if (remaining.length) {
  console.error(`${remaining.length} file(s) not published: ${remaining.join(", ")}\nrun the same command again to finish`)
  process.exit(1)
}
console.log(`all ${local.length} files published and size-verified`)
