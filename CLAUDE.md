# Pivot Mail — project instructions for Claude

## ⚠️ STANDING INSTRUCTION — Reference Generator stays the same as Pivot OS (Minhaj, 2026-11-22, STRICT)

"When we add any changes to reference number generator, it also should change in Pivot Mail as well."
`web/src/components/RefGenerator.tsx` is Pivot Mail's copy of the Pivot OS Reference Generator
(repo `minh44j/Pivot-OS-1.0`, `src/modules/shipping/components/ReferenceGenerator.tsx` and the Travel one).
Numbers and pick-lists come from Pivot OS through `web/api/cases/index.ts` → `/api/integrations/pivot-mail/*`
(see PIVOT_OS_LINK.md). Any change to the generator in either app is made in BOTH, in the same task:
the form here, `web/src/cases.ts`, `web/api/cases/index.ts`, a case in `web/tests/pivotos.test.mts`,
and the Pivot OS side (its app route AND its pivot-mail route; Pivot OS has a parity test for those).

## Reference Generator on/off switch

Hidden 2026-11-23 while Pivot OS updated it; shown again 2026-11-24 at Minhaj's word ("Show the ref number generator"),
after mirroring what changed in Pivot OS meanwhile (#504: pivot-mail mint reads `cargo`, port search reads `mode`; #508:
lookup also returns typed places — same fields). Switch: `web/src/features.ts` `REF_GENERATOR` (false hides the Ref No.
button and "New mail with a reference number"). Change it only when Minhaj asks; when turning it back on, apply the
parity rule above to whatever changed in Pivot OS meanwhile.

Write to Minhaj in plain, everyday English; he is not a developer.
