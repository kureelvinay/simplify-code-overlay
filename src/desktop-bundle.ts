import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { placeholders, type Brand } from "./brand"
import { sha256Sums } from "./bundle"
import { DesktopBuildError, type DesktopTarget } from "./desktop"

/**
 * The hand-deployable bundle of the desktop app: a disk image per Mac processor, upstream's NSIS
 * installer per Windows processor, a helper script per OS, a guide and checksums. Nothing here is
 * signed by Apple or Microsoft, and the scripts and the guide say so.
 */

export function desktopArtifactName(brand: Brand, target: DesktopTarget): string {
  if (target.platform === "darwin") return `${brand.productName}-mac-${target.arch === "arm64" ? "apple-silicon" : "intel"}.dmg`
  return `${brand.productName}-windows-${target.arch}-setup.exe`
}

const envPrefix = (brand: Brand) => `${placeholders(brand).productSlug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_DESKTOP`

/** A compressed disk image holding the app and the usual drag-to-Applications shortcut. */
export async function makeDmg(app: string, out: string, volumeName: string): Promise<void> {
  const staging = mkdtempSync(path.join(tmpdir(), "desktop-dmg-"))
  try {
    // ditto, not cp: it keeps symlinks inside the app's frameworks and the ad-hoc signature intact
    const copied = await $`ditto ${app} ${path.join(staging, path.basename(app))}`.quiet().nothrow()
    if (copied.exitCode !== 0) throw new DesktopBuildError("dmg", `ditto exit ${copied.exitCode}`)
    symlinkSync("/Applications", path.join(staging, "Applications"))
    // makehybrid + convert rather than `hdiutil create -srcfolder`: create mounts a scratch image
    // behind the scenes, which fails with "Resource busy" on some Macs; makehybrid mounts nothing.
    const raw = path.join(staging, "..", `${path.basename(staging)}-raw.dmg`)
    try {
      const made = await $`hdiutil makehybrid -hfs -hfs-volume-name ${volumeName} -o ${raw} ${staging}`.quiet().nothrow()
      if (made.exitCode !== 0) throw new DesktopBuildError("dmg", `hdiutil makehybrid exit ${made.exitCode}: ${made.stderr.toString().trim()}`)
      rmSync(out, { force: true })
      const packed = await $`hdiutil convert ${raw} -format UDZO -o ${out}`.quiet().nothrow()
      if (packed.exitCode !== 0) throw new DesktopBuildError("dmg", `hdiutil convert exit ${packed.exitCode}: ${packed.stderr.toString().trim()}`)
    } finally {
      rmSync(raw, { force: true })
    }
  } finally {
    rmSync(staging, { recursive: true, force: true })
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
# Run it from the folder that holds the .dmg files. It picks the disk image for this Mac's processor,
# copies ${name}.app into /Applications (or ~/Applications without administrator rights), and clears
# the "downloaded from the internet" mark. That last step matters: the app is not signed by Apple, so
# without it macOS refuses to open the app. Set ${dirVar} to install somewhere else.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
case "$(uname -m)" in
  arm64) DMG="${desktopArtifactName(brand, { platform: "darwin", arch: "arm64" })}" ;;
  x86_64) DMG="${desktopArtifactName(brand, { platform: "darwin", arch: "x64" })}" ;;
  *) echo "unsupported processor: $(uname -m)" >&2; exit 1 ;;
esac
# an Intel terminal on an Apple Silicon Mac reports x86_64; the hardware decides
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then DMG="${desktopArtifactName(brand, { platform: "darwin", arch: "arm64" })}"; fi
[ -f "$HERE/$DMG" ] || { echo "missing $HERE/$DMG: download it into the same folder as this script" >&2; exit 1; }

if [ -n "\${${dirVar}:-}" ]; then APPS="$${dirVar}"
elif [ -w /Applications ]; then APPS=/Applications
else APPS="$HOME/Applications"; fi
mkdir -p "$APPS"
DEST="$APPS/${name}.app"

MNT=$(mktemp -d "\${TMPDIR:-/tmp}/${placeholders(brand).productSlug}-desktop.XXXXXX")
cleanup() { hdiutil detach "$MNT" -quiet 2>/dev/null || hdiutil detach "$MNT" -force -quiet 2>/dev/null || true; rmdir "$MNT" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
hdiutil attach "$HERE/$DMG" -nobrowse -readonly -noverify -mountpoint "$MNT" -quiet

# Quit a running copy first, matched by its full path. Never by name: Apple's Xcode is a different app.
if pgrep -f "$DEST/Contents/MacOS/" >/dev/null 2>&1; then
  echo "quitting the running copy"
  pkill -TERM -f "$DEST/Contents/MacOS/" || true
  sleep 3
fi

rm -rf "$DEST"
ditto "$MNT/${name}.app" "$DEST"
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

**Use the script rather than dragging the app out of the disk image.** The app is not signed by Apple. A copy that was downloaded and dragged across is refused by macOS with "${name} is damaged and can't be opened" or "Apple could not verify". The script clears the download mark that causes this. If you already dragged it across, this repairs it:

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

/** Turn built targets into the bundle folder. Mac apps become disk images; Windows installers are copied under a clearer name. */
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
    if (target.platform === "darwin") await makeDmg(source, path.join(outDir, name), brand.productName)
    else copyFileSync(source, path.join(outDir, name))
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
