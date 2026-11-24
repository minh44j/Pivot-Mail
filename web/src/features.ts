import { platform } from './platform'

/**
 * The reference number generator: hidden 2026-11-23 while Pivot OS updated it ("hide the reference generator button for a
 * while"), shown again 2026-11-24 ("Show the ref number generator"). false hides the Ref No. button and "New mail with a
 * reference number"; the code and the Pivot OS link stay either way. The storage key lets a test switch it on when hidden.
 */
export const REF_GENERATOR = true

export const refGeneratorOn = (): boolean => REF_GENERATOR || platform.storage.get('pm.feature.ref') === '1'
