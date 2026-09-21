// Drop-in replacement for upstream packages/ui/src/v2/components/wordmark-v2.tsx.
// Same export, props, viewBox and fade mask. "X" on upstream's pixel grid, then
// upstream's "code" glyphs shifted left so the five letters are centred.
import { createUniqueId, type ComponentProps } from "solid-js"

export function WordmarkV2(props: Pick<ComponentProps<"svg">, "class">) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g opacity="0.6">
        <g mask={`url(#${mask})`}>
          <g opacity="0.16">
            <path
              opacity="0.7"
              d="M138.46 18H156.92V54.857H138.46V18ZM193.85 18H212.31V54.857H193.85V18ZM156.92 54.857H193.85V73.286H156.92V54.857ZM138.46 73.286H156.92V110.143H138.46V73.286ZM193.85 73.286H212.31V110.143H193.85V73.286Z"
              fill="currentColor"
            />
            <g transform="translate(-138.46 0)">
              <path
                opacity="0.7"
                d="M442.846 36.4286H387.462V91.7143H442.846V110.143H369V18H442.846V36.4286Z"
                fill="currentColor"
              />
              <path
                opacity="0.7"
                d="M517.385 36.4286H480.462V91.7143H517.385V36.4286ZM535.846 110.143H462V18H535.846V110.143Z"
                fill="currentColor"
              />
              <path
                opacity="0.7"
                d="M609.385 36.8571H572.462V92.1429H609.385V36.8571ZM627.846 110.571H554V18.4286H609.385V0H627.846V110.571Z"
                fill="currentColor"
              />
              <path
                opacity="0.7"
                d="M664.462 36.4286V54.8571H701.385V36.4286H664.462ZM719.846 73.2857H664.462V91.7143H719.846V110.143H646V18H719.846V73.2857Z"
                fill="currentColor"
              />
            </g>
          </g>
        </g>
      </g>
      {/* Outside the fade mask so it stays legible; right-aligned under the last letter. */}
      <text
        x="581.4"
        y="127"
        text-anchor="end"
        font-size="17"
        font-weight="500"
        letter-spacing="0.3"
        fill="currentColor"
        opacity="0.5"
      >by SimplifyX</text>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="720" height="129">
          <rect width="720" height="129" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="360" y1="68" x2="360" y2="129" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
