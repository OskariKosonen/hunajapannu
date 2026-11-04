/**
 * The categorical order for every share bar on the site. Validated against
 * the panel surface for colour-vision deficiency (worst adjacent ΔE 8.4).
 * A sixth category is never a generated hue: it folds into a neutral
 * remainder, and every swatch has its name beside it.
 */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
export const REMAINDER = "rgb(var(--fg-subtle) / 0.45)";
