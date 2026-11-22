# Pivot Mail — project instructions for Claude

## ⚠️ STANDING INSTRUCTION — Reference Generator stays the same as Pivot OS (Minhaj, 2026-11-22, STRICT)

"When we add any changes to reference number generator, it also should change in Pivot Mail as well."
`web/src/components/RefGenerator.tsx` is Pivot Mail's copy of the Pivot OS Reference Generator
(repo `minh44j/Pivot-OS-1.0`, `src/modules/shipping/components/ReferenceGenerator.tsx` and the Travel one).
Numbers and pick-lists come from Pivot OS through `web/api/cases/index.ts` → `/api/integrations/pivot-mail/*`
(see PIVOT_OS_LINK.md). Any change to the generator in either app is made in BOTH, in the same task:
the form here, `web/src/cases.ts`, `web/api/cases/index.ts`, a case in `web/tests/pivotos.test.mts`,
and the Pivot OS side (its app route AND its pivot-mail route; Pivot OS has a parity test for those).

Write to Minhaj in plain, everyday English; he is not a developer.
