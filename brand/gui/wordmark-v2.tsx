// Drop-in replacement for upstream packages/ui/src/v2/components/wordmark-v2.tsx.
// Same export, props, height and fade mask. "simplify" in upstream's pixel font
// (script/make-wordmark.ts), then upstream's own "code" glyphs moved to follow it. Thirteen letters
// need a wider viewBox than upstream's eight; every caller sizes it by width, so it just renders shorter.
import { createUniqueId, type ComponentProps } from "solid-js"

export function WordmarkV2(props: Pick<ComponentProps<"svg">, "class">) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 939.857 129"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g opacity="0.6">
        <g mask={`url(#${mask})`}>
          <g opacity="0.16">
            <path
              opacity="0.7"
              d="M92.143 0H110.571V18.429H92.143ZM331.714 0H350.143V18.429H331.714ZM368.571 0H387V18.429H368.571ZM423.857 0H460.714V18.429H423.857ZM0 18.429H73.714V36.857H0ZM129 18.429H221.143V36.857H129ZM239.571 18.429H313.286V36.857H239.571ZM331.714 18.429H350.143V36.857H331.714ZM423.857 18.429H442.286V36.857H423.857ZM479.143 18.429H497.571V36.857H479.143ZM534.429 18.429H552.857V36.857H534.429ZM0 36.857H18.429V55.286H0ZM92.143 36.857H110.571V55.286H92.143ZM129 36.857H147.429V55.286H129ZM165.857 36.857H184.286V55.286H165.857ZM202.714 36.857H221.143V55.286H202.714ZM239.571 36.857H258V55.286H239.571ZM294.857 36.857H313.286V55.286H294.857ZM331.714 36.857H350.143V55.286H331.714ZM368.571 36.857H387V55.286H368.571ZM405.429 36.857H460.714V55.286H405.429ZM479.143 36.857H497.571V55.286H479.143ZM534.429 36.857H552.857V55.286H534.429ZM0 55.286H73.714V73.714H0ZM92.143 55.286H110.571V73.714H92.143ZM129 55.286H147.429V73.714H129ZM165.857 55.286H184.286V73.714H165.857ZM202.714 55.286H221.143V73.714H202.714ZM239.571 55.286H258V73.714H239.571ZM294.857 55.286H313.286V73.714H294.857ZM331.714 55.286H350.143V73.714H331.714ZM368.571 55.286H387V73.714H368.571ZM423.857 55.286H442.286V73.714H423.857ZM479.143 55.286H497.571V73.714H479.143ZM534.429 55.286H552.857V73.714H534.429ZM55.286 73.714H73.714V92.143H55.286ZM92.143 73.714H110.571V92.143H92.143ZM129 73.714H147.429V92.143H129ZM165.857 73.714H184.286V92.143H165.857ZM202.714 73.714H221.143V92.143H202.714ZM239.571 73.714H258V92.143H239.571ZM294.857 73.714H313.286V92.143H294.857ZM331.714 73.714H350.143V92.143H331.714ZM368.571 73.714H387V92.143H368.571ZM423.857 73.714H442.286V92.143H423.857ZM479.143 73.714H497.571V92.143H479.143ZM534.429 73.714H552.857V92.143H534.429ZM0 92.143H73.714V110.571H0ZM92.143 92.143H110.571V110.571H92.143ZM129 92.143H147.429V110.571H129ZM165.857 92.143H184.286V110.571H165.857ZM202.714 92.143H221.143V110.571H202.714ZM239.571 92.143H313.286V110.571H239.571ZM331.714 92.143H350.143V110.571H331.714ZM368.571 92.143H387V110.571H368.571ZM423.857 92.143H442.286V110.571H423.857ZM479.143 92.143H552.857V110.571H479.143ZM239.571 110.571H258V129H239.571ZM534.429 110.571H552.857V129H534.429Z"
              fill="currentColor"
            />
            <g transform="translate(220.714 0)">
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
        x="939.857"
        y="127"
        text-anchor="end"
        font-size="17"
        font-weight="500"
        letter-spacing="0.3"
        fill="currentColor"
        opacity="0.5"
      >by SimplifyX</text>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="939.857" height="129">
          <rect width="939.857" height="129" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="469.928" y1="68" x2="469.928" y2="129" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
