import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { $ } from "bun"
import { placeholders, type Brand } from "./brand"
import { countOccurrences, TransformError } from "./rebrand"

export interface PlatformPackage {
  dir: string
  name: string
  version: string
}

const UPSTREAM_PREFIX = "opencode-"

export function scopedName(upstreamName: string, brand: Brand): string {
  if (!upstreamName.startsWith(UPSTREAM_PREFIX)) throw new Error(`unexpected platform package name: ${upstreamName}`)
  return brand.npmPackage + upstreamName.slice(UPSTREAM_PREFIX.length - 1) // keep the leading "-"
}

/** The command's file name. Upstream's build (transform 115) names the binary after the product slug. */
export function binaryName(brand: Brand): string {
  const slug = placeholders(brand).productSlug
  return process.platform === "win32" ? `${slug}.exe` : slug
}

/**
 * Rename every upstream platform folder's package.json to the scoped name and
 * drop the MIT LICENSE in. Safe to run twice: already-scoped packages are kept,
 * the meta package folder is skipped.
 */
export function rebrandPlatformPackages(dist: string, brand: Brand, upstreamRoot: string): PlatformPackage[] {
  const result: PlatformPackage[] = []
  for (const entry of readdirSync(dist, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(dist, entry.name)
    const file = path.join(dir, "package.json")
    if (!existsSync(file)) continue
    const pkg = JSON.parse(readFileSync(file, "utf8")) as { name: string; version: string }
    if (pkg.name === brand.npmPackage) continue
    if (pkg.name.startsWith(UPSTREAM_PREFIX)) {
      pkg.name = scopedName(pkg.name, brand)
      writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n")
    } else if (!pkg.name.startsWith(`${brand.npmPackage}-`)) {
      continue
    }
    copyFileSync(path.join(upstreamRoot, "LICENSE"), path.join(dir, "LICENSE"))
    result.push({ dir, name: pkg.name, version: pkg.version })
  }
  return result
}

export function metaPackageJson(
  brand: Brand,
  version: string,
  platforms: PlatformPackage[],
  deps: Record<string, string> = {},
) {
  const optionalDependencies: Record<string, string> = {}
  for (const p of platforms) optionalDependencies[p.name] = deps[p.name] ?? p.version
  return {
    name: brand.npmPackage,
    version,
    description: `${brand.productName} ${brand.tagline}`,
    license: "MIT",
    // upstream's trick: the bin entry points at a placeholder that postinstall replaces with the real binary
    bin: { [placeholders(brand).productSlug]: `./bin/${placeholders(brand).productSlug}.exe` },
    scripts: { postinstall: "node ./postinstall.mjs" },
    os: ["darwin", "linux", "win32"],
    cpu: ["arm64", "x64"],
    optionalDependencies,
  }
}

export const POSTINSTALL_ANCHOR = "const base = `opencode-${platform}-${arch}`"
const POSTINSTALL_ANCHORS: [find: string, replace: (brand: Brand, slug: string) => string][] = [
  [POSTINSTALL_ANCHOR, (brand) => "const base = `" + brand.npmPackage + "-${platform}-${arch}`"],
  ['const sourceBinary = platform === "windows" ? "opencode.exe" : "opencode"', (_b, slug) => `const sourceBinary = platform === "windows" ? "${slug}.exe" : "${slug}"`],
  ['const targetBinary = path.join(__dirname, "bin", "opencode.exe")', (_b, slug) => `const targetBinary = path.join(__dirname, "bin", "${slug}.exe")`],
]

export function rebrandPostinstall(source: string, brand: Brand): string {
  const slug = placeholders(brand).productSlug
  for (const [find, replace] of POSTINSTALL_ANCHORS) {
    const actual = countOccurrences(source, find)
    if (actual !== 1) throw new TransformError("packages/opencode/script/postinstall.mjs", find, 1, actual)
    source = source.replace(find, replace(brand, slug))
  }
  return source
}

/** Replaced by the real binary when postinstall runs; explains itself otherwise. */
export function placeholderBin(brand: Brand): string {
  return [
    "#!/bin/sh",
    `echo "Error: ${brand.npmPackage}'s postinstall script was not run." >&2`,
    'echo "This happens with --ignore-scripts, or with package managers that skip postinstall (pnpm)." >&2',
    `echo "Fix: cd node_modules/${brand.npmPackage} && node postinstall.mjs" >&2`,
    "exit 1",
    "",
  ].join("\n")
}

export interface MetaOptions {
  /** optionalDependencies overrides, e.g. { "@simplifyx/simplify-code-darwin-arm64": "file:/abs/path.tgz" } */
  fileDeps?: Record<string, string>
  /** folder name under dist/, default "meta" */
  outDirName?: string
}

export function writeMetaPackage(
  dist: string,
  brand: Brand,
  version: string,
  platforms: PlatformPackage[],
  upstreamRoot: string,
  opts: MetaOptions = {},
): string {
  const dir = path.join(dist, opts.outDirName ?? "meta")
  mkdirSync(path.join(dir, "bin"), { recursive: true })
  writeFileSync(path.join(dir, "package.json"), JSON.stringify(metaPackageJson(brand, version, platforms, opts.fileDeps), null, 2) + "\n")
  const postinstall = readFileSync(path.join(upstreamRoot, "packages/opencode/script/postinstall.mjs"), "utf8")
  writeFileSync(path.join(dir, "postinstall.mjs"), rebrandPostinstall(postinstall, brand))
  copyFileSync(path.join(upstreamRoot, "LICENSE"), path.join(dir, "LICENSE"))
  const bin = path.join(dir, "bin", `${placeholders(brand).productSlug}.exe`)
  writeFileSync(bin, placeholderBin(brand))
  chmodSync(bin, 0o755)
  return dir
}

/** `npm pack` one package directory into outDir; returns the tarball path. */
export async function packDir(dir: string, outDir: string): Promise<string> {
  mkdirSync(outDir, { recursive: true })
  if (process.platform !== "win32") await $`chmod -R 755 ${path.join(dir, "bin")}`.quiet()
  const out = await $`npm pack --pack-destination ${outDir} --json`.cwd(dir).quiet().text()
  const [info] = JSON.parse(out) as { filename: string }[]
  return path.join(outDir, info.filename)
}

/** The plain (non-baseline, non-musl) package matching this machine. */
// On a CPU without AVX2 this picks a binary that will not run; such a machine needs the -baseline package.
export function hostPackage(platforms: PlatformPackage[]): PlatformPackage {
  const os = process.platform === "win32" ? "windows" : process.platform
  const suffix = `-${os}-${process.arch}`
  const match = platforms.find((p) => p.name.endsWith(suffix))
  if (!match) throw new Error(`no platform package for ${os}-${process.arch} in: ${platforms.map((p) => p.name).join(", ")}`)
  return match
}
