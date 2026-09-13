/** Hold a chosen element still across a re-render that changes the page's
 *  height (A59-3).
 *
 *  The routes fold INTO the scene: showing them swaps a short block for a
 *  long one, and hiding them does the reverse. Without this the scene's
 *  header jumps under the author on every toggle and they lose their place
 *  in the very thing they were deciding about.
 *
 *  Kept free of the DOM by construction — the caller supplies the
 *  measurement and the scroll — so the arithmetic that matters can be
 *  tested without a browser.
 *
 *  @param measure   distance from the top of the viewport to the element to
 *                   hold still, or null when it cannot be found
 *  @param change    the state change that re-renders the page
 *  @param scrollBy  moves the window by a delta
 *  @param afterPaint runs its callback once the re-render has landed
 */
export function keepAnchored(
  measure: () => number | null,
  change: () => void,
  scrollBy: (dy: number) => void,
  afterPaint: (fn: () => void) => void,
): void {
  const before = measure()
  change()
  // Nothing to hold on to: the change still happens, the page just lands
  // wherever it lands. Never guess a position.
  if (before === null) return
  afterPaint(() => {
    const after = measure()
    if (after === null) return
    const dy = after - before
    if (dy !== 0) scrollBy(dy)
  })
}
