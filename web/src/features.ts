import { platform } from './platform'

/**
 * The reference number generator is hidden for now (Minhaj, 2026-11-23: "hide the reference generator button for a while,
 * as we are updating the section. I will tell you once it's done"). To bring it back, set REF_GENERATOR to true.
 * Hidden means no Ref No. button and no "New mail with a reference number"; the code and Pivot OS link are untouched.
 * The browser tests switch it on for themselves with the storage key below.
 */
export const REF_GENERATOR = false

export const refGeneratorOn = (): boolean => REF_GENERATOR || platform.storage.get('pm.feature.ref') === '1'
