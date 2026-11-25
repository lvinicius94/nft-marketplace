import { useEffect, useState } from 'react'
import { onAnnounce } from '@/lib/announcer'

/** Screen-reader live regions for mutation feedback and realtime changes. */
export function LiveAnnouncer() {
  const [polite, setPolite] = useState('')
  const [assertive, setAssertive] = useState('')
  useEffect(
    () =>
      onAnnounce((message, politeness) => {
        const setter = politeness === 'assertive' ? setAssertive : setPolite
        setter('')
        // Re-set on next frame so repeated identical messages are announced again.
        requestAnimationFrame(() => setter(message))
      }),
    [],
  )
  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-polite">
        {polite}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {assertive}
      </div>
    </>
  )
}
