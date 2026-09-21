// Drop-in replacement for upstream packages/tui/src/logo.ts.
// `left` is rendered in theme.primary, `right` in theme.text (see transform 3).
// Marks: "_" shadowed space, "^" shadowed ▀, "~" shadow-colored ▀, "," shadow-colored ▄.
export const logo = {
  left: ["     ", "▀▄ ▄▀", " ▄█▄ ", "▄▀ ▀▄"],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

// Unchanged from upstream; used by the OpenCode Go dialog.
export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

export const marks = "_^~,"
