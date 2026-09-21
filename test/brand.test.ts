import { describe, expect, test } from "bun:test"
import { fill, loadBrand, parseBrand, placeholders } from "../src/brand"

const valid = {
  productName: "XCode",
  tagline: "by SimplifyX",
  companyName: "SimplifyX",
  npmScope: "@simplifyx",
  npmPackage: "@simplifyx/xcode",
  releaseRepo: "simplifyx/xcode-releases",
  upstreamRepo: "anomalyco/opencode",
}

describe("parseBrand", () => {
  test("accepts a complete brand", () => {
    expect(parseBrand(JSON.stringify(valid))).toEqual(valid)
  })

  test("rejects a missing key", () => {
    const { tagline, ...rest } = valid
    expect(() => parseBrand(JSON.stringify(rest))).toThrow('missing or empty "tagline"')
  })

  test("rejects an empty key", () => {
    expect(() => parseBrand(JSON.stringify({ ...valid, productName: "" }))).toThrow('missing or empty "productName"')
  })

  test("rejects a package outside the scope", () => {
    expect(() => parseBrand(JSON.stringify({ ...valid, npmPackage: "@other/xcode" }))).toThrow("must start with npmScope")
  })
})

describe("loadBrand", () => {
  test("loads the checked-in brand.json", () => {
    const brand = loadBrand()
    expect(brand.productName).toBe("XCode")
    expect(brand.npmPackage).toBe("@simplifyx/xcode")
  })
})

describe("placeholders", () => {
  test("derives the desktop bundle id and a file-name slug", () => {
    const vars = placeholders(valid)
    expect(vars.desktopAppId).toBe("com.simplifyx.xcode.desktop")
    expect(vars.productSlug).toBe("xcode")
    expect(vars.managedDomain).toBe("com.simplifyx.xcode.managed")
  })

  test("derives the %2F-encoded package name", () => {
    const vars = placeholders(valid)
    expect(vars.npmPackageEncoded).toBe("@simplifyx%2Fxcode")
    expect(vars.productName).toBe("XCode")
    expect(vars.releaseRepo).toBe("simplifyx/xcode-releases")
  })
})

describe("fill", () => {
  test("replaces every placeholder", () => {
    expect(fill("{{productName}} {{tagline}}", placeholders(valid))).toBe("XCode by SimplifyX")
  })

  test("throws on an unknown placeholder", () => {
    expect(() => fill("{{nope}}", placeholders(valid))).toThrow("unknown placeholder {{nope}}")
  })

  test("leaves single-brace JSX alone", () => {
    expect(fill("{highlight}x{/highlight}", {})).toBe("{highlight}x{/highlight}")
  })
})

describe("companyName", () => {
  test("is required: it becomes the publisher Windows shows for the desktop app", () => {
    const { companyName: _drop, ...rest } = loadBrand() as unknown as Record<string, string>
    expect(() => parseBrand(JSON.stringify(rest))).toThrow('missing or empty "companyName"')
  })
  test("is available to transforms", () => {
    expect(placeholders(loadBrand()).companyName).toBe("SimplifyX")
  })
})
