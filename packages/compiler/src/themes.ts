/**
 * Built-in reveal.js themes. Selecting one of these names with `\theme{name}`
 * or `config.theme.name` swaps the presentation to the corresponding official
 * reveal stylesheet. Any other name is treated as a project-local theme and
 * left to the default RevealTeX theme.
 */
export const REVEAL_THEMES = [
  "black",
  "black-contrast",
  "white",
  "white-contrast",
  "league",
  "beige",
  "sky",
  "night",
  "serif",
  "simple",
  "solarized",
  "moon",
  "dracula",
  "blood"
] as const;

export type RevealTheme = (typeof REVEAL_THEMES)[number];

export function isRevealTheme(name: string | undefined): name is RevealTheme {
  return Boolean(name && (REVEAL_THEMES as readonly string[]).includes(name));
}
