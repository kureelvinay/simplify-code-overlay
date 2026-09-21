import type { Brand } from "./brand"

/**
 * Pure parts of publishing a --package bundle as a GitHub Release. The network half lives in
 * script/publish-bundle.ts; what to upload, what to replace and what the release says are decided
 * here so they can be tested without a network.
 */

export interface LocalAsset {
  name: string
  size: number
}
export interface RemoteAsset {
  id: number
  name: string
  size: number
  /** GitHub reports "uploaded" for a complete asset and "starter" for an upload that never finished. */
  state: string
}

/**
 * Compare the bundle folder with what the release already holds. Anything complete and the same size
 * is skipped, so an interrupted upload resumes where it stopped. Anything partial or a different size
 * is replaced, never trusted.
 */
export function missingAssets(local: LocalAsset[], remote: RemoteAsset[]): { upload: LocalAsset[]; replace: RemoteAsset[] } {
  const upload: LocalAsset[] = []
  const replace: RemoteAsset[] = []
  for (const asset of local) {
    const existing = remote.find((r) => r.name === asset.name)
    if (existing && existing.state === "uploaded" && existing.size === asset.size) continue
    if (existing) replace.push(existing)
    upload.push(asset)
  }
  return { upload, replace }
}

export function contentType(name: string): string {
  if (name.endsWith(".zip")) return "application/zip"
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) return "application/gzip"
  return "text/plain; charset=utf-8"
}

export function releaseTitle(brand: Brand, version: string): string {
  return `${brand.productName} ${brand.tagline} ${version} (terminal version)`
}

export function releaseNotes(brand: Brand, version: string, repo: string): string {
  return `The terminal version of **${brand.productName} ${brand.tagline}** ${version}, as standalone programs. Target machines need no Node and no npm.

Rebranded from [OpenCode v${version}](https://github.com/${brand.upstreamRepo}/releases/tag/v${version}) (MIT licensed; \`LICENSE\` is attached).

## Install

Download **the archive for your machine plus the installer** into one folder, then:

| Machine | Download | Run |
|---|---|---|
| Mac, Apple Silicon | \`xcode-darwin-arm64.zip\`, \`install.sh\` | \`sh install.sh\` |
| Mac, Intel | \`xcode-darwin-x64.zip\`, \`xcode-darwin-x64-baseline.zip\`, \`install.sh\` | \`sh install.sh\` |
| Windows, Intel or AMD | \`xcode-windows-x64.zip\`, \`xcode-windows-x64-baseline.zip\`, \`install.ps1\` | \`powershell -ExecutionPolicy Bypass -File .\\install.ps1\` |
| Windows on ARM | \`xcode-windows-arm64.zip\`, \`install.ps1\` | same |
| Linux | the matching \`xcode-linux-*.tar.gz\`, \`install.sh\` | \`sh install.sh\` |

The installer picks the right build for the processor (the "baseline" archive is for older processors without AVX2), installs the \`opencode\` command for the current user without administrator rights, and prints the version. \`INSTALL.md\` has the details. Afterwards \`opencode --version\` should print \`${version}\`.

**This repository is private**, so downloads need a signed-in browser, or on a machine without one: \`gh release download v${version} --repo ${repo}\`.

## Know before you install

- **The programs are not code-signed.** The installers clear the "downloaded from the internet" mark that would otherwise make macOS Gatekeeper or Windows SmartScreen refuse to run them. Only install from this release; for a company-wide rollout, sign the binaries and use device management instead.
- **\`install.ps1\` was generated on a Mac and has not been run on Windows** by the people who built it. If it misbehaves, unzip the archive and put \`opencode.exe\` anywhere on your PATH; that is all the script does.
- Verify a download against \`SHA256SUMS\`: \`shasum -a 256 -c SHA256SUMS\` (macOS, Linux) or \`Get-FileHash <file> -Algorithm SHA256\` (Windows).
- Updating means installing a newer release over the old one. This is the terminal version; the desktop app is packaged separately.
`
}
