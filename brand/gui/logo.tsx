// Drop-in replacement for upstream packages/ui/src/components/logo.tsx.
// Same exports and props. The "X" is drawn on upstream's own pixel grid (4 x 5 blocks)
// so it sits naturally beside the unchanged "code" glyphs; its centre block carries
// the brand purple.
import { Show, type ComponentProps } from "solid-js"
import { useTheme } from "../theme/context"

const BRAND = "#9a4bb0"

/**
 * Not in upstream: the persistent brand shown at the right of the titlebar, which is the
 * only chrome present on every page (see the titlebar transforms). Inline styles only,
 * so it does not depend on which utility classes upstream's build happens to emit.
 * pointer-events: none keeps the titlebar draggable underneath it.
 * The two strings must match brand.json; test/transforms.test.ts checks that.
 */
export const BrandLockup = () => {
  return (
    <div
      data-component="brand-lockup"
      aria-label="XCode by SimplifyX"
      style={{
        display: "flex",
        "align-items": "center",
        gap: "6px",
        "flex-shrink": "0",
        "margin-left": "12px",
        "margin-right": "8px",
        "white-space": "nowrap",
        "pointer-events": "none",
        "user-select": "none",
        "line-height": "1",
      }}
    >
      <svg viewBox="0 0 16 20" width="11" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {/* the purple titlebar strip sets --brand-lockup-accent, because purple on purple would vanish */}
        <path d="M4 8H12V12H4V8Z" fill={`var(--brand-lockup-accent, ${BRAND})`} />
        <path
          d="M0 0H4V8H0V0ZM12 0H16V8H12V0ZM0 12H4V20H0V12ZM12 12H16V20H12V12Z"
          fill="var(--v2-text-text-base, var(--icon-strong-base))"
        />
      </svg>
      <span style={{ "font-size": "12px", "font-weight": "600", color: "var(--v2-text-text-base, var(--text-strong))" }}>XCode</span>
      <span style={{ "font-size": "11px", color: "var(--v2-text-text-muted, var(--text-weak))" }}>by SimplifyX</span>
    </div>
  )
}

/**
 * Not in upstream: a one-click light/dark switch for the titlebar, left of the lockup.
 * It shows the mode you would switch TO (moon in light, sun in dark) and flips the effective
 * mode through the theme context's own setter, which also persists the choice, so Settings
 * stays in sync. A real <button>, because upstream's base.css exempts buttons from the
 * titlebar's window-drag region. Hover and focus styles live with the titlebar strip CSS.
 */
export const BrandThemeToggle = () => {
  const theme = useTheme()
  const label = () => (theme.mode() === "dark" ? "Switch to light mode" : "Switch to dark mode")
  return (
    <button
      type="button"
      data-component="brand-theme-toggle"
      aria-label={label()}
      title={label()}
      onClick={() => theme.setColorScheme(theme.mode() === "dark" ? "light" : "dark")}
      style={{
        display: "inline-flex",
        "align-items": "center",
        "justify-content": "center",
        width: "24px",
        height: "24px",
        "flex-shrink": "0",
        "margin-left": "8px",
        padding: "0",
        border: "0",
        "border-radius": "6px",
        background: "transparent",
        color: "var(--v2-text-text-base, var(--icon-strong-base))",
        cursor: "pointer",
      }}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <Show
          when={theme.mode() === "dark"}
          fallback={<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
        </Show>
      </svg>
    </button>
  )
}

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-logo-mark-shadow" d="M4 8H12V12H4V8Z" fill={BRAND} />
      <path
        data-slot="logo-logo-mark-o"
        d="M0 0H4V8H0V0ZM12 0H16V8H12V0ZM0 12H4V20H0V12ZM12 12H16V20H12V12Z"
        fill="var(--icon-strong-base)"
      />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M20 40H60V60H20V40Z" fill={BRAND} />
      <path
        d="M0 0H20V40H0V0ZM60 0H80V40H60V0ZM0 60H20V100H0V60ZM60 60H80V100H60V60Z"
        fill="var(--icon-strong-base)"
      />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      {/* "X", then upstream's "code" glyphs shifted left so the five letters stay centred in the original box */}
      <g>
        <path d="M51 18H63V24H51V18Z" fill={BRAND} />
        <path
          d="M45 6H51V18H45V6ZM63 6H69V18H63V6ZM45 24H51V36H45V24ZM63 24H69V36H63V24Z"
          fill="var(--icon-strong-base)"
        />
      </g>
      <g transform="translate(-45 0)">
        <path d="M144 30H126V18H144V30Z" fill="var(--icon-weak-base)" />
        <path d="M144 12H126V30H144V36H120V6H144V12Z" fill="var(--icon-strong-base)" />
        <path d="M168 30H156V18H168V30Z" fill="var(--icon-weak-base)" />
        <path d="M168 12H156V30H168V12ZM174 36H150V6H174V36Z" fill="var(--icon-strong-base)" />
        <path d="M198 30H186V18H198V30Z" fill="var(--icon-weak-base)" />
        <path d="M198 12H186V30H198V12ZM204 36H180V6H198V0H204V36Z" fill="var(--icon-strong-base)" />
        <path d="M234 24V30H216V24H234Z" fill="var(--icon-weak-base)" />
        <path d="M216 12V18H228V12H216ZM234 24H216V30H234V36H210V6H234V24Z" fill="var(--icon-strong-base)" />
      </g>
    </svg>
  )
}
