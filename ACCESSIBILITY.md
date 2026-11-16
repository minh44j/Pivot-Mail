# Accessibility audit (preview build)

Target: WCAG 2.1 AA, plus the 2.2 minimum target size (24 px). Light theme only.
⚠️ Verify with specialist: automated tools find roughly a third of real problems. This audit has **not** included a pass with a real screen reader. No conformance claim is made.

## Method
1. **axe-core 4.10** (rules: wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice) on 26 screens, at desktop (1400 px) and phone (390 px): sign-in, list, reader, HTML message, composer, reference dialog, shortcut help, and every Settings section.
2. **Scripted keyboard checks:** dialog focus entry, focus trap, Escape, focus return; skip link; keyboard-opened message menu; focus indicators on 28 tab stops.
3. **Reflow and targets:** 320 px width (list, reader, composer) and tap-target sizes at phone width.

## Found and fixed
| # | Finding | Fix |
|---|---------|-----|
| 1 | White text on the blue "selected" buttons was 4.0:1 (needs 4.5:1); company tags, avatars and status text on tinted backgrounds were 3.3 to 3.8:1 | Added darker "ink" tones for solid fills and text on tints; disabled users no longer rely on opacity |
| 2 | Toolbar used `role="toolbar"` on `<header>` (not allowed) so page content sat outside landmarks | Plain banner header |
| 3 | No level-one heading on the mail screen | Logo is now the page `<h1>` (image text "Pivot Mail") |
| 4 | Dialog headers and the composer header counted as extra page banners | Changed to non-landmark elements |
| 5 | Shortcut help: scrollable area not keyboard reachable; section label duplicated the message list landmark | Focusable labelled region; "… shortcuts" labels |
| 6 | **Escape did not close the "Go to folder" dialog once focus left its input** | Escape handled on the whole dialog |
| 7 | Dialogs did not trap Tab, did not always move focus in, and did not return focus | One shared handler for every dialog (`modalfocus.ts`) |
| 8 | No way to open the message menu from the keyboard | Menu key and Shift+F10 |
| 9 | No skip link | "Skip to message list" (first Tab stop) |
| 10 | Tiny hit areas: row tick box (14 px), smart chips, "Mark all as read", trim toggle, row action buttons (touch devices) | Larger hit areas on touch; tick box gets an invisible 32 px target |

## Result after fixes
- axe: **0 violations** on all 26 screens.
- Dialogs: focus enters, stays inside (40 Tab presses), Escape closes, focus returns (5 dialogs).
- 320 px: no horizontal scrolling on list, reader or composer.

## Known limits (not fixed or not measurable here)
- Not tested with NVDA, JAWS or VoiceOver; list-row reading order and live-region announcements need a human pass.
- Search box focus ring is drawn on its container (axe accepts it; some checkers flag the input).
- Hover-only row actions are mouse-only by design; the same actions are available from the reader, the message menu and keyboard shortcuts.
- Colour is never the only signal for unread/flag/important (icons and text exist), but colour-category tints rely on the category dot; names are available in the menu.
- Dark theme does not exist, so dark contrast is untested.
- Sample content in the HTML viewer can carry low-contrast colours from the sender; this is the sender's content.
