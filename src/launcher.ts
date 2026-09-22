import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { bundleId as brandBundleId, type Brand } from "./brand"

/**
 * A double-clickable macOS app that opens the branded TUI in Terminal. It is the
 * companion to the desktop app, which owns the plain product name, so this one is
 * "<productName> Terminal".
 *
 * The bundle is deliberately thin: its executable hands a `run.command` script to
 * Terminal (so the TUI gets a real tty and the user's own shell environment), and
 * that script asks for a project folder and execs `opencode` there. Nothing in it is
 * machine-specific, so the same bundle can be pushed to every Mac.
 */

/** Display, bundle and executable name. */
export function launcherName(brand: Brand): string {
  return `${brand.productName} Terminal`
}

export function appName(brand: Brand): string {
  return `${launcherName(brand)}.app`
}

/** "@simplifyx/simplify-code" -> "com.simplifyx.simplify-code.terminal" (the desktop app is ".desktop") */
export function bundleId(brand: Brand): string {
  return `${brandBundleId(brand)}.terminal`
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export function infoPlist(brand: Brand, version: string): string {
  const entries: [string, string][] = [
    ["CFBundleName", `<string>${xml(launcherName(brand))}</string>`],
    ["CFBundleDisplayName", `<string>${xml(launcherName(brand))}</string>`],
    ["CFBundleIdentifier", `<string>${xml(bundleId(brand))}</string>`],
    ["CFBundleExecutable", `<string>${xml(launcherName(brand))}</string>`],
    ["CFBundleIconFile", "<string>AppIcon</string>"],
    ["CFBundleShortVersionString", `<string>${xml(version)}</string>`],
    ["CFBundleVersion", `<string>${xml(version)}</string>`],
    ["CFBundlePackageType", "<string>APPL</string>"],
    ["CFBundleInfoDictionaryVersion", "<string>6.0</string>"],
    ["LSMinimumSystemVersion", "<string>11.0</string>"],
    ["NSHighResolutionCapable", "<true/>"],
  ]
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    ...entries.map(([key, value]) => `  <key>${key}</key>\n  ${value}`),
    "</dict>",
    "</plist>",
    "",
  ].join("\n")
}

/** Contents/MacOS/<productName>: `open -a Terminal` needs no Automation permission, unlike AppleScript. */
export function launcherScript(): string {
  return [
    "#!/bin/sh",
    "# Bundle entry point: hand the work to Terminal so the TUI gets a real tty.",
    'here="$(cd "$(dirname "$0")" && pwd)"',
    'exec open -a Terminal "$here/../Resources/run.command"',
    "",
  ].join("\n")
}

/** Contents/Resources/run.command: runs inside Terminal. */
export function runScript(brand: Brand): string {
  const name = brand.productName
  const envVar = `${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_PROJECT_DIR`
  return `#!/bin/zsh
# Runs inside Terminal, launched by ${appName(brand)}.
# Set ${envVar} to skip the folder chooser.
state_dir="$HOME/Library/Application Support/${launcherName(brand)}"
last_file="$state_dir/last-folder"

project="\${${envVar}:-}"
if [ -z "$project" ]; then
  default="$HOME"
  [ -r "$last_file" ] && [ -d "$(cat "$last_file")" ] && default="$(cat "$last_file")"
  project="$(osascript \\
    -e 'on run argv' \\
    -e 'POSIX path of (choose folder with prompt "Open a project folder in ${name}" default location (POSIX file (item 1 of argv)))' \\
    -e 'end run' "$default" 2>/dev/null)" || exit 0
fi
[ -d "$project" ] || exit 0
mkdir -p "$state_dir" && print -r -- "$project" > "$last_file"

# Terminal starts this script from the user's login shell, but fall back to an
# interactive shell lookup for setups (nvm, asdf) that only extend PATH in .zshrc.
bin="$(command -v opencode 2>/dev/null)"
[ -n "$bin" ] || bin="$(/bin/zsh -ilc 'command -v opencode' 2>/dev/null | tail -n 1)"
if [ -z "$bin" ] || [ ! -x "$bin" ]; then
  echo "${name} ${brand.tagline} is not installed, or 'opencode' is not on your PATH."
  echo "Install it with:  npm install -g ${brand.npmPackage}"
  echo
  read -k 1 "?Press any key to close. " 2>/dev/null
  exit 1
fi

printf '\\e[8;42;150t' # ask Terminal for a roomier window
cd "$project" && exec "$bin"
`
}

/** Build every size macOS wants from one 1024px PNG. */
async function writeIcns(iconPng: string, out: string): Promise<void> {
  const work = mkdtempSync(path.join(tmpdir(), "simplify-code-iconset-"))
  try {
    const iconset = path.join(work, "AppIcon.iconset")
    mkdirSync(iconset)
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        const px = size * scale
        const file = path.join(iconset, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`)
        await $`sips -z ${px} ${px} ${iconPng} --out ${file}`.quiet()
      }
    }
    await $`iconutil -c icns ${iconset} -o ${out}`.quiet()
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/** Write `<destDir>/<productName>.app`, replacing any previous copy. Returns the app path. */
export async function buildMacApp(destDir: string, brand: Brand, version: string, iconPng: string): Promise<string> {
  const app = path.join(destDir, appName(brand))
  rmSync(app, { recursive: true, force: true })
  const macos = path.join(app, "Contents", "MacOS")
  const resources = path.join(app, "Contents", "Resources")
  mkdirSync(macos, { recursive: true })
  mkdirSync(resources, { recursive: true })

  writeFileSync(path.join(app, "Contents", "Info.plist"), infoPlist(brand, version))
  const exe = path.join(macos, launcherName(brand))
  writeFileSync(exe, launcherScript())
  chmodSync(exe, 0o755)
  const run = path.join(resources, "run.command")
  writeFileSync(run, runScript(brand))
  chmodSync(run, 0o755)

  // sips and iconutil ship with macOS only; elsewhere the bundle is built without an icon.
  if (process.platform === "darwin") await writeIcns(iconPng, path.join(resources, "AppIcon.icns"))
  return app
}
