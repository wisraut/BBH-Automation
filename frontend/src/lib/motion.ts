// Staggered-entrance delay for grid/list items that use the `animate-rise`
// keyframe. Each item starts slightly after the previous one so a group of cards
// flows in instead of snapping in all at once.
//
// Kept deliberately subtle and CAPPED: a small step, and after `cap` items the
// delay stops growing — so a long list is never gated behind a long cascade
// (which would slow scanning, the opposite of what we want in a clinical tool).
// prefers-reduced-motion needs no special-casing here: the global reset in
// index.css zeroes animation-delay/duration, so every item lands immediately.
export function staggerStyle(
  index: number,
  step = 40,
  cap = 12,
): { animationDelay: string } {
  return { animationDelay: `${Math.min(index, cap) * step}ms` }
}
