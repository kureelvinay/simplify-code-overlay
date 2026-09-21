import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { placeholders, type Brand } from "./brand"
import { sha256Sums } from "./bundle"
import { DesktopBuildError, type DesktopTarget } from "./desktop"

/**
 * The hand-deployable bundle of the desktop app: a zip per Mac processor, upstream's NSIS
 * installer per Windows processor, a helper script per OS, a guide and checksums. Nothing here is
 * signed by Apple or Microsoft, and the scripts and the guide say so.
 */

export function desktopArtifactName(brand: Brand, target: DesktopTarget): string {
  // no spaces: GitHub rewrites them in release asset names, which would break the scripts and SHA256SUMS
  const name = brand.productName.replace(/\s+/g, "")
  if (target.platform === "darwin") return `${name}-mac-${target.arch === "arm64" ? "apple-silicon" : "intel"}.zip`
  return `${name}-windows-${target.arch}-setup.exe`
}

const envPrefix = (brand: Brand) => `${placeholders(brand).productSlug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_DESKTOP`

/**
 * A zip, not a disk image. Building a disk image means mounting a scratch volume, which some Macs
 * (Spotlight, endpoint security) will not let go of again: `hdiutil create` then fails with "Resource
 * busy". The variant that mounts nothing, `hdiutil makehybrid`, stamps Finder information on every
 * file, which invalidates the code signature. ditto's zip keeps the signature byte for byte.
 */
export async function makeMacZip(app: string, out: string): Promise<void> {
  rmSync(out, { force: true })
  const r = await $`ditto -c -k --sequesterRsrc --keepParent ${app} ${out}`.quiet().nothrow()
  if (r.exitCode !== 0) throw new DesktopBuildError("zip", `ditto exit ${r.exitCode}: ${r.stderr.toString().trim()}`)
}

/** Unpack a shipped Mac archive and check the signature inside: an app with a broken signature does not start on Apple Silicon. */
export async function verifyMacZip(zip: string, appName: string): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "desktop-zip-"))
  try {
    const x = await $`ditto -x -k ${zip} ${dir}`.quiet().nothrow()
    if (x.exitCode !== 0) throw new DesktopBuildError("verify", `${path.basename(zip)} does not unpack (ditto exit ${x.exitCode})`)
    const r = await $`codesign --verify --deep --strict ${path.join(dir, appName)}`.quiet().nothrow()
    if (r.exitCode !== 0) throw new DesktopBuildError("verify", `${path.basename(zip)}: signature invalid after packing: ${r.stderr.toString().trim()}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function installMacSh(brand: Brand, version: string): string {
  const name = brand.productName
  const dirVar = `${envPrefix(brand)}_INSTALL_DIR`
  return `#!/bin/sh
# Installs the ${name} ${brand.tagline} ${version} desktop app on this Mac.
#
#   sh install-mac.sh
#
# Run it from the folder that holds the .zip files. It picks the archive for this Mac's processor,
# unpacks ${name}.app into /Applications (or ~/Applications without administrator rights), and clears
# the "downloaded from the internet" mark. That last step matters: the app is not signed by Apple, so
# without it macOS refuses to open the app. Set ${dirVar} to install somewhere else.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
case "$(uname -m)" in
  arm64) ZIP="${desktopArtifactName(brand, { platform: "darwin", arch: "arm64" })}" ;;
  x86_64) ZIP="${desktopArtifactName(brand, { platform: "darwin", arch: "x64" })}" ;;
  *) echo "unsupported processor: $(uname -m)" >&2; exit 1 ;;
esac
# an Intel terminal on an Apple Silicon Mac reports x86_64; the hardware decides
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then ZIP="${desktopArtifactName(brand, { platform: "darwin", arch: "arm64" })}"; fi
[ -f "$HERE/$ZIP" ] || { echo "missing $HERE/$ZIP: download it into the same folder as this script" >&2; exit 1; }

if [ -n "\${${dirVar}:-}" ]; then APPS="$${dirVar}"
elif [ -w /Applications ]; then APPS=/Applications
else APPS="$HOME/Applications"; fi
mkdir -p "$APPS"
DEST="$APPS/${name}.app"

TMP=$(mktemp -d "\${TMPDIR:-/tmp}/${placeholders(brand).productSlug}-desktop.XXXXXX")
trap 'rm -rf "$TMP"' EXIT INT TERM
# ditto, not unzip: it restores the app exactly, which its code signature depends on
ditto -x -k "$HERE/$ZIP" "$TMP"
[ -d "$TMP/${name}.app" ] || { echo "$ZIP does not contain ${name}.app" >&2; exit 1; }

# Quit a running copy first, matched by its full path. Never by name: Apple's Xcode is a different app.
if pgrep -f "$DEST/Contents/MacOS/" >/dev/null 2>&1; then
  echo "quitting the running copy"
  pkill -TERM -f "$DEST/Contents/MacOS/" || true
  sleep 3
fi

rm -rf "$DEST"
ditto "$TMP/${name}.app" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

echo "${name} ${version} installed: $DEST"
echo "open it from Launchpad or Spotlight, or run: open \\"$DEST\\""
`
}

export function installWindowsPs1(brand: Brand, version: string): string {
  const name = brand.productName
  const lines = [
    `# Installs the ${name} ${brand.tagline} ${version} desktop app on this PC, for the current user.`,
    "#",
    "#   powershell -ExecutionPolicy Bypass -File .\\install-windows.ps1",
    "#",
    "# Run it from the folder that holds the setup .exe files. It picks the installer for this PC's",
    "# processor and clears the \"downloaded from the internet\" mark first. The installer is not signed,",
    "# so without that step Windows SmartScreen would stop it. No administrator rights are needed.",
    "$ErrorActionPreference = 'Stop'",
    "$arch = $env:PROCESSOR_ARCHITEW6432",
    "if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }",
    `if ($arch -eq 'ARM64') { $setup = '${desktopArtifactName(brand, { platform: "win32", arch: "arm64" })}' } else { $setup = '${desktopArtifactName(brand, { platform: "win32", arch: "x64" })}' }`,
    "$path = Join-Path $PSScriptRoot $setup",
    "if (-not (Test-Path $path)) { throw \"missing $path: download it into the same folder as this script\" }",
    "Unblock-File -Path $path",
    `Write-Host "installing ${name} ${version} from $setup ..."`,
    "$p = Start-Process -FilePath $path -Wait -PassThru",
    "if ($p.ExitCode -ne 0) { throw \"the installer exited with code $($p.ExitCode)\" }",
    `Write-Host "${name} ${version} installed. Open it from the Start menu."`,
  ]
  return lines.join("\r\n") + "\r\n"
}

export function desktopInstallGuide(brand: Brand, version: string, artifacts: string[]): string {
  const name = brand.productName
  const has = (t: DesktopTarget) => artifacts.includes(desktopArtifactName(brand, t))
  const row = (label: string, t: DesktopTarget) => (has(t) ? `| ${label} | \`${desktopArtifactName(brand, t)}\` |\n` : "")
  const mac = has({ platform: "darwin", arch: "arm64" }) || has({ platform: "darwin", arch: "x64" })
  const win = has({ platform: "win32", arch: "x64" }) || has({ platform: "win32", arch: "arm64" })
  return `# ${name} ${brand.tagline} ${version}: installing the desktop app

| Machine | Installer |
|---|---|
${row("Mac, Apple Silicon (M1 and later)", { platform: "darwin", arch: "arm64" })}${row("Mac, Intel", { platform: "darwin", arch: "x64" })}${row("Windows, Intel or AMD", { platform: "win32", arch: "x64" })}${row("Windows on ARM", { platform: "win32", arch: "arm64" })}
Download the installer for the machine **and the helper script for its system** into one folder.
${
  mac
    ? `
## macOS

Open Terminal in that folder and run:

\`\`\`bash
sh install-mac.sh
\`\`\`

It copies ${name}.app into /Applications (or ~/Applications if you are not an administrator) and opens normally afterwards.

**Use the script rather than double-clicking the zip.** The app is not signed by Apple. A copy that was downloaded and unpacked by hand is refused by macOS with "${name} is damaged and can't be opened" or "Apple could not verify". The script clears the download mark that causes this. If you already unpacked it by hand and moved it to Applications, this repairs it:

\`\`\`bash
xattr -dr com.apple.quarantine /Applications/${name}.app
\`\`\`
`
    : ""
}${
    win
      ? `
## Windows

Open PowerShell in that folder and run:

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File .\\install-windows.ps1
\`\`\`

It installs for the current user only, without administrator rights, and adds ${name} to the Start menu. If you double-click the setup file instead, Windows SmartScreen shows "Windows protected your PC" because the installer is not signed: choose **More info**, then **Run anyway**.

**The Windows app was built on a Mac and has not been run on Windows by the people who built it.** It was checked as far as a Mac can check it: right processor type, our name and icon, and the Windows terminal component inside. Treat the first install as the real test and report what you see.
`
      : ""
  }
## Things to know

- **Nothing here is signed** by Apple or Microsoft. That is acceptable for a pilot with people who know where the files came from. For a company-wide rollout, sign and notarize the builds and push them through device management.
- **The app does not update itself.** Upstream's updater is switched off, because it would replace ${name} with stock OpenCode. A new version means installing a newer copy over the old one.
- **Check the download** against \`SHA256SUMS\`. macOS: \`shasum -a 256 -c SHA256SUMS\`. Windows: \`Get-FileHash <file> -Algorithm SHA256\`.
- Configuration is shared with the terminal version: \`~/.config/${placeholders(brand).productSlug}/${placeholders(brand).productSlug}.json\`.
- Uninstall: on macOS, delete ${name}.app; on Windows, Settings, Apps, ${name}, Uninstall.
`
}

/** Turn built targets into the bundle folder. Mac apps become zips, each checked for a valid signature after packing; Windows installers are copied under a clearer name. */
export async function writeDesktopBundle(
  built: { target: DesktopTarget; path: string }[],
  outDir: string,
  brand: Brand,
  version: string,
  licenseFile: string,
): Promise<string[]> {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  const artifacts: string[] = []
  for (const { target, path: source } of built) {
    const name = desktopArtifactName(brand, target)
    if (target.platform === "darwin") {
      await makeMacZip(source, path.join(outDir, name))
      await verifyMacZip(path.join(outDir, name), path.basename(source))
    } else copyFileSync(source, path.join(outDir, name))
    artifacts.push(name)
  }
  const names = [...artifacts]
  if (built.some((b) => b.target.platform === "darwin")) {
    writeFileSync(path.join(outDir, "install-mac.sh"), installMacSh(brand, version), { mode: 0o755 })
    names.push("install-mac.sh")
  }
  if (built.some((b) => b.target.platform === "win32")) {
    writeFileSync(path.join(outDir, "install-windows.ps1"), installWindowsPs1(brand, version))
    names.push("install-windows.ps1")
  }
  writeFileSync(path.join(outDir, "INSTALL.md"), desktopInstallGuide(brand, version, artifacts))
  copyFileSync(licenseFile, path.join(outDir, "LICENSE"))
  names.push("INSTALL.md", "LICENSE")
  writeFileSync(path.join(outDir, "SHA256SUMS"), sha256Sums(outDir, names))
  return [...names, "SHA256SUMS"].map((n) => path.join(outDir, n))
}
