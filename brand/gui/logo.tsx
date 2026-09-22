// Drop-in replacement for upstream packages/ui/src/components/logo.tsx.
// Same exports and props. The mark is an "S" on upstream's own pixel grid (4 x 5 blocks), the
// same letter shape the wordmark uses; its middle bar carries the brand purple.
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
      aria-label="Simplify Code by SimplifyX"
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
        <path d="M0 8H16V12H0V8Z" fill={`var(--brand-lockup-accent, ${BRAND})`} />
        <path
          d="M0 0H16V4H0V0ZM0 4H4V8H0V4ZM12 12H16V16H12V12ZM0 16H16V20H0V16Z"
          fill="var(--v2-text-text-base, var(--icon-strong-base))"
        />
      </svg>
      <span style={{ "font-size": "12px", "font-weight": "600", color: "var(--v2-text-text-base, var(--text-strong))" }}>Simplify Code</span>
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
      <path data-slot="logo-logo-mark-shadow" d="M0 8H16V12H0V8Z" fill={BRAND} />
      <path
        data-slot="logo-logo-mark-o"
        d="M0 0H16V4H0V0ZM0 4H4V8H0V4ZM12 12H16V16H12V12ZM0 16H16V20H0V16Z"
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
      <path d="M0 40H80V60H0V40Z" fill={BRAND} />
      <path
        d="M0 0H80V20H0V0ZM0 20H20V40H0V20ZM60 60H80V80H60V60ZM0 80H80V100H0V80Z"
        fill="var(--icon-strong-base)"
      />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 306 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      {/* "simplify" in upstream's pixel font (script/make-wordmark.ts), then upstream's own "code" glyphs moved to follow it */}
      <path d="M30 0H36V6H30ZM108 0H114V6H108ZM120 0H126V6H120ZM138 0H150V6H138ZM0 6H24V12H0ZM42 6H72V12H42ZM78 6H102V12H78ZM108 6H114V12H108ZM138 6H144V12H138ZM156 6H162V12H156ZM174 6H180V12H174ZM0 12H6V18H0ZM30 12H36V18H30ZM42 12H48V18H42ZM54 12H60V18H54ZM66 12H72V18H66ZM78 12H84V18H78ZM96 12H102V18H96ZM108 12H114V18H108ZM120 12H126V18H120ZM132 12H150V18H132ZM156 12H162V18H156ZM174 12H180V18H174ZM0 18H24V24H0ZM30 18H36V24H30ZM42 18H48V24H42ZM54 18H60V24H54ZM66 18H72V24H66ZM78 18H84V24H78ZM96 18H102V24H96ZM108 18H114V24H108ZM120 18H126V24H120ZM138 18H144V24H138ZM156 18H162V24H156ZM174 18H180V24H174ZM18 24H24V30H18ZM30 24H36V30H30ZM42 24H48V30H42ZM54 24H60V30H54ZM66 24H72V30H66ZM78 24H84V30H78ZM96 24H102V30H96ZM108 24H114V30H108ZM120 24H126V30H120ZM138 24H144V30H138ZM156 24H162V30H156ZM174 24H180V30H174ZM0 30H24V36H0ZM30 30H36V36H30ZM42 30H48V36H42ZM54 30H60V36H54ZM66 30H72V36H66ZM78 30H102V36H78ZM108 30H114V36H108ZM120 30H126V36H120ZM138 30H144V36H138ZM156 30H180V36H156ZM78 36H84V42H78ZM174 36H180V42H174Z" fill={BRAND} />
      <g transform="translate(72 0)">
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
