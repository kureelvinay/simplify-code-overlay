import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export interface Brand {
  productName: string
  tagline: string
  npmScope: string
  npmPackage: string
  releaseRepo: string
  upstreamRepo: string
}

const REQUIRED: (keyof Brand)[] = ["productName", "tagline", "npmScope", "npmPackage", "releaseRepo", "upstreamRepo"]

/** Absolute path to the brand/ directory, with a trailing slash. */
export const BRAND_DIR = fileURLToPath(new URL("../brand/", import.meta.url))

export function parseBrand(json: string): Brand {
  const data = JSON.parse(json) as Record<string, unknown>
  for (const key of REQUIRED) {
    const value = data[key]
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`brand.json: missing or empty "${key}"`)
    }
  }
  const brand = data as unknown as Brand
  if (!brand.npmPackage.startsWith(`${brand.npmScope}/`)) {
    throw new Error(`brand.json: npmPackage "${brand.npmPackage}" must start with npmScope "${brand.npmScope}/"`)
  }
  return brand
}

export function loadBrand(path = `${BRAND_DIR}brand.json`): Brand {
  return parseBrand(readFileSync(path, "utf8"))
}

/** Reverse-DNS id derived from the npm package: "@simplifyx/xcode" -> "com.simplifyx.xcode". */
export function bundleId(brand: Brand): string {
  const [scope, name] = brand.npmPackage.replace(/^@/, "").split("/")
  return `com.${scope}.${name}`
}

/** Values available as {{name}} inside transform replacement strings. */
export function placeholders(brand: Brand): Record<string, string> {
  return {
    productName: brand.productName,
    tagline: brand.tagline,
    npmPackage: brand.npmPackage,
    npmPackageEncoded: brand.npmPackage.replace("/", "%2F"),
    releaseRepo: brand.releaseRepo,
    desktopAppId: `${bundleId(brand)}.desktop`,
    productSlug: brand.productName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    managedDomain: `${bundleId(brand)}.managed`,
  }
}

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key]
    if (value === undefined) throw new Error(`unknown placeholder {{${key}}}`)
    return value
  })
}
