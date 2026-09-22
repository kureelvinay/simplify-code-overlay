import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { $ } from "bun"
import { placeholders, type Brand } from "./brand"
import { sha256Sums } from "./bundle"

/**
 * The company-controlled part of a rollout: the managed config (enforced) and the team folder
 * (shared agents, commands, skills, local plugins), installed by an administrator into a folder
 * developers can read but not change. Nothing here touches a developer's home folder.
 */

export const TEAM_DIR = fileURLToPath(new URL("../team/", import.meta.url))
const MANAGED_SOURCE = fileURLToPath(new URL("../managed/simplify-code.jsonc", import.meta.url))

const slug = (brand: Brand) => placeholders(brand).productSlug
const envVar = (brand: Brand) => `${slug(brand).toUpperCase().replace(/[^A-Z0-9]/g, "_")}_TEAM_ROOT`

export function installTeamSh(brand: Brand): string {
  const s = slug(brand)
  return `#!/bin/sh
# Installs the company-controlled ${brand.productName} configuration on this machine (macOS or Linux):
# the enforced config and the shared team folder, owned by root, readable by everyone.
#
#   sudo sh install-team.sh [--plugin-lock]
#
# --plugin-lock: only plugins declared here load; plugins a developer adds to their own config are
# ignored. Without the flag, a previous lock is removed.
# Developers' home folders are never touched. Re-run to update; the team folder is replaced wholesale.
# ${envVar(brand)} overrides the destination, for testing without root.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
if [ -n "\${${envVar(brand)}:-}" ]; then ROOT="$${envVar(brand)}"
else
  [ "$(id -u)" = "0" ] || { echo "run this with sudo: the destination is owned by root so developers cannot change it" >&2; exit 1; }
  case "$(uname -s)" in
    Darwin) ROOT="/Library/Application Support/${s}" ;;
    *) ROOT="/etc/${s}" ;;
  esac
fi
LOCK=no
for arg in "$@"; do [ "$arg" = "--plugin-lock" ] && LOCK=yes; done
for f in "${s}.jsonc" team.zip; do [ -f "$HERE/$f" ] || { echo "missing $HERE/$f" >&2; exit 1; }; done

mkdir -p "$ROOT"
cp "$HERE/${s}.jsonc" "$ROOT/${s}.jsonc"
rm -rf "$ROOT/team"
TMP=$(mktemp -d "\${TMPDIR:-/tmp}/${s}-team.XXXXXX")
trap 'rm -rf "$TMP"' EXIT INT TERM
unzip -q "$HERE/team.zip" -d "$TMP"
mv "$TMP/team" "$ROOT/team"
if [ "$LOCK" = yes ]; then touch "$ROOT/plugin-lock"; else rm -f "$ROOT/plugin-lock"; fi

if [ "$(id -u)" = "0" ]; then
  GROUP=$( [ "$(uname -s)" = Darwin ] && echo wheel || echo root )
  chown -R root:"$GROUP" "$ROOT"
fi
chmod -R u=rwX,go=rX "$ROOT"

echo "${brand.productName} team configuration installed in $ROOT"
echo "  enforced config: $ROOT/${s}.jsonc"
echo "  shared folder:   $ROOT/team"
[ "$LOCK" = yes ] && echo "  plugin lock:     on (only administrator-declared plugins load)" || echo "  plugin lock:     off"
echo "It takes effect the next time ${brand.productName} starts."
`
}

export function installTeamPs1(brand: Brand): string {
  const s = slug(brand)
  const lines = [
    "#Requires -RunAsAdministrator",
    `# Installs the company-controlled ${brand.productName} configuration on this PC: the enforced config and`,
    "# the shared team folder, under ProgramData, writable by Administrators only, readable by everyone.",
    "#",
    "#   powershell -ExecutionPolicy Bypass -File .\\install-team.ps1 [-PluginLock]",
    "#",
    "# -PluginLock: only plugins declared here load. Without it, a previous lock is removed.",
    "# Developers' profiles are never touched. Re-run to update; the team folder is replaced wholesale.",
    "param([switch]$PluginLock)",
    "$ErrorActionPreference = 'Stop'",
    `$root = Join-Path $env:ProgramData '${s}'`,
    "foreach ($f in @('" + s + ".jsonc', 'team.zip')) { if (-not (Test-Path (Join-Path $PSScriptRoot $f))) { throw \"missing $f next to this script\" } }",
    "New-Item -ItemType Directory -Force -Path $root | Out-Null",
    `Copy-Item (Join-Path $PSScriptRoot '${s}.jsonc') (Join-Path $root '${s}.jsonc') -Force`,
    "$team = Join-Path $root 'team'",
    "if (Test-Path $team) { Remove-Item $team -Recurse -Force }",
    "Expand-Archive -Path (Join-Path $PSScriptRoot 'team.zip') -DestinationPath $root -Force",
    "$lock = Join-Path $root 'plugin-lock'",
    "if ($PluginLock) { New-Item -ItemType File -Force -Path $lock | Out-Null } elseif (Test-Path $lock) { Remove-Item $lock -Force }",
    "# Administrators and SYSTEM: full control. Everyone else: read and execute only. Inherited permissions off.",
    "icacls $root /inheritance:r /grant:r 'Administrators:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' 'Users:(OI)(CI)RX' | Out-Null",
    `Write-Host "${brand.productName} team configuration installed in $root"`,
    "Write-Host \"  enforced config: $root\\" + s + ".jsonc\"",
    "Write-Host \"  shared folder:   $root\\team\"",
    "if ($PluginLock) { Write-Host '  plugin lock:     on' } else { Write-Host '  plugin lock:     off' }",
    `Write-Host "It takes effect the next time ${brand.productName} starts."`,
  ]
  return lines.join("\r\n") + "\r\n"
}

export function teamInstallGuide(brand: Brand, version: string): string {
  const s = slug(brand)
  const name = brand.productName
  return `# ${name} ${brand.tagline}: company-controlled configuration (${version})

This is the part of the rollout IT owns. It is installed **once per machine, by an administrator**, into a folder developers can read but not change:

| Platform | Folder |
|---|---|
| macOS | \`/Library/Application Support/${s}/\` |
| Windows | \`%ProgramData%\\${s}\\\` |
| Linux | \`/etc/${s}/\` |

Inside it:

- **\`${s}.jsonc\`**, the enforced config. Company gateway, the models developers may use, sharing off, self-update off, the required plugins. Loaded above every developer's own config; nothing in a home folder can override it.
- **\`team/\`**, the shared folder: \`agents/\`, \`commands/\`, \`skills/\` and \`plugins/\` (the local plugin files with their dependencies). Loaded like a config folder, on every machine.
- **\`plugin-lock\`** (optional), an empty marker file. While it exists, ${name} ignores any plugin that was not declared by an administrator, so developers cannot add their own.

Developers' home folders are **never touched**. \`~/.config/${s}/\` stays theirs for personal additions. The one thing each developer must provide is their own gateway key, at \`~/.config/simplifyx/gateway-key\`, readable only by them.

## Install or update

macOS and Linux, in the folder that holds these files:

\`\`\`bash
sudo sh install-team.sh
\`\`\`

Add \`--plugin-lock\` to forbid plugins that are not declared here.

Windows, in an **elevated** PowerShell:

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File .\\install-team.ps1
\`\`\`

Add \`-PluginLock\` for the same effect. Re-running either script updates everything; the team folder is replaced wholesale, so a skill removed here is removed everywhere. Changes take effect the next time ${name} starts on that machine.

## Check a machine

\`\`\`bash
${s} debug config
\`\`\`

\`share\` must be \`disabled\`, \`enabled_providers\` exactly \`["company-gateway"]\`, and the shared agents must appear in \`${s} agent list\`. Do not paste the output anywhere if the machine still has a literal key in a personal config.

## Before the first deployment

\`${s}.jsonc\` still carries the placeholder gateway address. Set the real one and run the checker in the overlay repo (\`bun run script/check-managed.ts\`) until it prints \`ok, deployable\`.

## With an MDM

Jamf, Intune, Kandji or FleetDM can push this folder instead of the scripts. The managed config can also be delivered as a configuration profile for the preference domain \`${placeholders(brand).managedDomain}\`, which outranks even the file.
`
}

/** The team folder with its plugins' dependencies installed, zipped as team/... */
async function zipTeam(out: string, installPlugins: boolean): Promise<void> {
  const staging = mkdtempSync(path.join(tmpdir(), "team-zip-"))
  try {
    const team = path.join(staging, "team")
    cpSync(TEAM_DIR, team, { recursive: true, filter: (src) => !path.basename(src).startsWith(".DS_Store") })
    if (installPlugins) {
      // the app installs npm plugins itself, but not the dependencies of local plugin FILES; and target
      // machines have no npm, so they are installed here and shipped
      const r = await $`npm ci --omit=dev --ignore-scripts --no-audit --no-fund`.cwd(path.join(team, "plugins")).quiet().nothrow()
      if (r.exitCode !== 0) throw new Error(`npm ci in team/plugins failed (exit ${r.exitCode}): ${r.stderr.toString().slice(0, 500)}`)
    }
    rmSync(out, { force: true })
    const z = await $`zip -qr -X ${out} team -x '*/.DS_Store'`.cwd(staging).quiet().nothrow()
    if (z.exitCode !== 0) throw new Error(`zip exit ${z.exitCode}`)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

export async function writeTeamBundle(outDir: string, brand: Brand, version: string, opts: { installPlugins?: boolean } = {}): Promise<string[]> {
  const s = slug(brand)
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  copyFileSync(MANAGED_SOURCE, path.join(outDir, `${s}.jsonc`))
  await zipTeam(path.join(outDir, "team.zip"), opts.installPlugins ?? true)
  writeFileSync(path.join(outDir, "install-team.sh"), installTeamSh(brand), { mode: 0o755 })
  writeFileSync(path.join(outDir, "install-team.ps1"), installTeamPs1(brand))
  writeFileSync(path.join(outDir, "INSTALL.md"), teamInstallGuide(brand, version))
  const names = [`${s}.jsonc`, "team.zip", "install-team.sh", "install-team.ps1", "INSTALL.md"]
  writeFileSync(path.join(outDir, "SHA256SUMS"), sha256Sums(outDir, names))
  return [...names, "SHA256SUMS"].map((n) => path.join(outDir, n))
}
