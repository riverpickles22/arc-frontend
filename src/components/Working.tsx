/** The working state for a pass that has been asked but has not answered.
 *
 *  Deliberately indeterminate: these passes run against whichever engine is
 *  present, and on the keyless CLI path a rephrase can take tens of seconds.
 *  A bar that fills toward a known end would be a lie about a wait nobody can
 *  measure — so the sheen travels and nothing claims a percentage. What it
 *  does promise is that the box is alive, which a static sentence sitting
 *  there for thirty seconds actively fails to do.
 *
 *  The skeleton lines are the shape of the answer, not decoration: three
 *  alternatives are about what comes back, so the wait looks like the result
 *  it is about to become. */
export function Working({ label }: { label: string }) {
  return (
    <div className="sp-working" role="status" aria-live="polite">
      <p className="sp-working-label">{label}<span className="sp-dots" aria-hidden="true" /></p>
      <div className="sp-skel" aria-hidden="true">
        <span /><span /><span />
      </div>
    </div>
  )
}
