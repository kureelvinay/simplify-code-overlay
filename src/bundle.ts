import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { $ } from "bun"
import { placeholders, type Brand } from "./brand"
import type { PlatformPackage } from "./package"

/**
 * A hand-deployable bundle of the terminal version: one archive per platform holding the standalone
 * binary, an installer script for macOS/Linux and one for Windows, a guide and checksums.
 *
 * It needs no Node, npm or registry on the target machine: upstream compiles the CLI into a single
 * self-contained executable. This is the path for "a few machines by hand"; the npm packages and the
 * internal registry (--release) remain the path for a managed fleet.
 */

/** "@simplifyx/simplify-code-linux-x64-musl" -> "simplify-code-linux-x64-musl.tar.gz"; zip for macOS and Windows. */
export function archiveName(packageName: string): string {
  const base = packageName.split("/").pop()!
  return base.includes("linux") ? `${base}.tar.gz` : `${base}.zip`
}

/** Archive each platform's bin/ folder into outDir. Returns what was written and what failed. */
export async function archiveBinaries(platforms: PlatformPackage[], outDir: string): Promise<{ files: string[]; failed: string[] }> {
  const files: string[] = []
  const failed: string[] = []
  for (const p of platforms) {
    const name = archiveName(p.name)
    const file = path.join(outDir, name)
    const bin = path.join(p.dir, "bin")
    rmSync(file, { force: true })
    const r = name.endsWith(".tar.gz") ? await $`tar -czf ${file} -C ${bin} .`.quiet().nothrow() : await $`zip -qr ${file} .`.cwd(bin).quiet().nothrow()
    if (r.exitCode === 0) files.push(file)
    else failed.push(name)
  }
  return { files, failed }
}

export function sha256Sums(dir: string, names: string[]): string {
  return [...names]
    .sort()
    .map((name) => `${createHash("sha256").update(readFileSync(path.join(dir, name))).digest("hex")}  ${name}`)
    .join("\n")
    .concat("\n")
}

/** macOS and Linux installer. Picks the archive the way upstream's own installer does. */
export function installSh(brand: Brand, version: string): string {
  const slug = placeholders(brand).productSlug
  const envVar = `${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_INSTALL_DIR`
  return `#!/bin/sh
# ${brand.productName} ${brand.tagline} ${version}: installer for macOS and Linux.
# Run it from the folder it came in:   sh install.sh
# Installs the \`opencode\` command. Set ${envVar} to choose the folder.
set -eu

here=$(cd "$(dirname "$0")" && pwd)

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) echo "unsupported system: $(uname -s). On Windows, run install.ps1." >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) echo "unsupported processor: $(uname -m)" >&2; exit 1 ;;
esac

# Older x64 processors lack AVX2 and need the "baseline" build; Alpine and friends need the musl build.
suffix=""
if [ "$arch" = x64 ]; then
  if [ "$os" = darwin ]; then
    [ "$(sysctl -n hw.optional.avx2_0 2>/dev/null || echo 0)" = 1 ] || suffix="-baseline"
  else
    grep -qi avx2 /proc/cpuinfo 2>/dev/null || suffix="-baseline"
  fi
fi
if [ "$os" = linux ]; then
  if [ -f /etc/alpine-release ] || (ldd --version 2>&1 | grep -qi musl); then suffix="$suffix-musl"; fi
fi

name="${slug}-$os-$arch$suffix"
if [ "$os" = linux ]; then archive="$here/$name.tar.gz"; else archive="$here/$name.zip"; fi
if [ ! -f "$archive" ]; then
  echo "$(basename "$archive") is not in this bundle, so this machine ($os $arch$suffix) cannot be installed from it." >&2
  exit 1
fi

dest="\${${envVar}:-}"
if [ -z "$dest" ]; then
  if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then dest=/usr/local/bin; else dest="$HOME/.local/bin"; fi
fi
mkdir -p "$dest"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if [ "$os" = linux ]; then tar -xzf "$archive" -C "$tmp"; else unzip -q "$archive" -d "$tmp"; fi
install -m 755 "$tmp/opencode" "$dest/opencode"

# A binary that arrived by browser, mail or AirDrop carries macOS's quarantine flag, and Gatekeeper
# refuses to run an unsigned binary that has it. Clearing it is what "allowing" the app does.
if [ "$os" = darwin ]; then xattr -d com.apple.quarantine "$dest/opencode" 2>/dev/null || true; fi

echo "${brand.productName} ${brand.tagline} installed: $dest/opencode"
"$dest/opencode" --version

case ":$PATH:" in
  *":$dest:"*) ;;
  *) echo; echo "$dest is not on your PATH. Add this line to ~/.zshrc (or ~/.bashrc), then open a new terminal:"; echo "  export PATH=\\"$dest:\\$PATH\\"" ;;
esac
`
}

/** Windows installer (PowerShell 5 and later). Per-user, so it needs no administrator rights. */
export function installPs1(brand: Brand, version: string): string {
  const slug = placeholders(brand).productSlug
  const envVar = `${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_INSTALL_DIR`
  const lines = [
    `# ${brand.productName} ${brand.tagline} ${version}: installer for Windows.`,
    "# Run it from the folder it came in, in PowerShell:",
    "#   powershell -ExecutionPolicy Bypass -File .\\install.ps1",
    `# Installs the \`opencode\` command for the current user. Set ${envVar} to choose the folder.`,
    '$ErrorActionPreference = "Stop"',
    "",
    "$here = Split-Path -Parent $MyInvocation.MyCommand.Path",
    'if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { $arch = "arm64" } else { $arch = "x64" }',
    "",
    '# Older x64 processors lack AVX2 and need the "baseline" build. Same probe upstream\'s own wrapper uses.',
    '$suffix = ""',
    'if ($arch -eq "x64") {',
    "  $avx2 = $false",
    "  try {",
    '    $k = Add-Type -MemberDefinition \'[DllImport("kernel32.dll")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);\' -Name Kernel32 -Namespace Win32 -PassThru',
    "    $avx2 = $k::IsProcessorFeaturePresent(40)",
    "  } catch { $avx2 = $false }",
    '  if (-not $avx2) { $suffix = "-baseline" }',
    "}",
    "",
    `$archive = Join-Path $here "${slug}-windows-$arch$suffix.zip"`,
    "if (-not (Test-Path $archive)) {",
    '  Write-Error "$(Split-Path -Leaf $archive) is not in this bundle, so this machine (windows $arch$suffix) cannot be installed from it."',
    "  exit 1",
    "}",
    "",
    `if ($env:${envVar}) { $dest = $env:${envVar} } else { $dest = Join-Path $env:LOCALAPPDATA "Programs\\${brand.productName}" }`,
    "New-Item -ItemType Directory -Force -Path $dest | Out-Null",
    "Expand-Archive -Path $archive -DestinationPath $dest -Force",
    "",
    "# A file that arrived by browser or mail carries a downloaded-file mark, and SmartScreen blocks an",
    "# unsigned exe that has it. Removing the mark is what 'Run anyway' does.",
    "Get-ChildItem -Path $dest -Recurse | Unblock-File",
    "",
    '$userPath = [Environment]::GetEnvironmentVariable("Path", "User")',
    'if (-not $userPath) { $userPath = "" }',
    "if (($userPath -split ';') -notcontains $dest) {",
    '  [Environment]::SetEnvironmentVariable("Path", (($userPath.TrimEnd(";") + ";" + $dest).TrimStart(";")), "User")',
    '  Write-Host "Added $dest to your PATH. Open a new terminal for it to take effect."',
    "}",
    "",
    `Write-Host "${brand.productName} ${brand.tagline} installed: $dest\\opencode.exe"`,
    '& (Join-Path $dest "opencode.exe") --version',
    "",
  ]
  return lines.join("\r\n")
}

export function installGuide(brand: Brand, version: string, archives: string[]): string {
  const slug = placeholders(brand).productSlug
  const has = (s: string) => archives.some((a) => a.includes(s))
  return `# ${brand.productName} ${brand.tagline} ${version}: installing the terminal version

This folder is everything a machine needs. There is nothing to download and no Node or npm to install first: each archive holds one self-contained program.

## macOS and Linux

Copy this whole folder to the machine, open Terminal in it, and run:

\`\`\`bash
sh install.sh
\`\`\`

It picks the right build for the machine${has("darwin-x64") ? " (Apple Silicon or Intel, and the \"baseline\" build for older Intel processors)" : ""}, installs the \`opencode\` command into \`/usr/local/bin\` or \`~/.local/bin\`, and prints the version. If it says the folder is not on your PATH, add the line it shows to \`~/.zshrc\` and open a new terminal.

## Windows

Copy this whole folder to the machine, open PowerShell in it, and run:

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File .\\install.ps1
\`\`\`

It installs for the current user into \`%LOCALAPPDATA%\\Programs\\${brand.productName}\`, adds that folder to the user's PATH, and prints the version. No administrator rights are needed. Open a new terminal afterwards.

## Check it worked

\`\`\`bash
opencode --version
\`\`\`

It should print \`${version}\`. Then run \`opencode\` inside a project folder. Configuration goes in \`~/.config/${slug}/${slug}.json\`.

## Things to know

- **These builds are not code-signed.** The installers clear the "downloaded from the internet" flag that would otherwise make macOS Gatekeeper or Windows SmartScreen refuse to run them. That is safe here because you know where this folder came from; it is also exactly why you should only install from a copy you trust. For a company-wide rollout, sign the binaries and distribute them through your device management instead.
- **Check the download.** \`SHA256SUMS\` lists the expected checksum of every archive. On macOS or Linux: \`shasum -a 256 -c SHA256SUMS\`. On Windows: \`Get-FileHash <file> -Algorithm SHA256\`.
- **The Windows installer was generated on a Mac and has not been run on Windows by the people who built it.** If it misbehaves, unzip \`${slug}-windows-x64.zip\` by hand and put \`opencode.exe\` anywhere on your PATH; that is all the script does.
- **Updating** means installing a newer copy of this folder over the old one. \`opencode upgrade\` looks for an internal package registry, which a hand-installed copy does not have.
- This is the terminal version. The desktop app is packaged separately.

## What is in this folder

${archives.map((a) => `- \`${a}\``).join("\n")}
- \`install.sh\`, \`install.ps1\`, \`SHA256SUMS\`, \`LICENSE\` (OpenCode is MIT licensed)
`
}

/** Archives + installers + guide + checksums (+ LICENSE when given). Returns the files written and any archive that failed. */
export async function writeBundle(
  platforms: PlatformPackage[],
  outDir: string,
  brand: Brand,
  version: string,
  license?: string,
): Promise<{ files: string[]; failed: string[] }> {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  const { files, failed } = await archiveBinaries(platforms, outDir)
  const archives = files.map((f) => path.basename(f)).sort()

  const write = (name: string, content: string, mode?: number) => {
    const file = path.join(outDir, name)
    writeFileSync(file, content, mode === undefined ? undefined : { mode })
    files.push(file)
  }
  write("install.sh", installSh(brand, version), 0o755)
  write("install.ps1", installPs1(brand, version))
  write("INSTALL.md", installGuide(brand, version, archives))
  write("SHA256SUMS", sha256Sums(outDir, archives))
  const licenseFile = path.join(outDir, "LICENSE")
  if (license && existsSync(license)) copyFileSync(license, licenseFile)
  else writeFileSync(licenseFile, "OpenCode is MIT licensed. See https://github.com/anomalyco/opencode/blob/dev/LICENSE\n")
  files.push(licenseFile)
  return { files, failed }
}
