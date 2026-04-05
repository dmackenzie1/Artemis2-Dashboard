# 2026-04-05 — Dashboard reference alignment pass 3

## Summary
- Made the Mission Activity Signature (histogram) panel full width by changing the bottom dashboard row to a single-column layout.
- Removed the standalone Pipeline toolbar window from the right rail.
- Tightened global spacing/padding and reduced headline/body/control font sizes to better match the reference composition.
- Increased background image visibility by raising the imagery layer opacity and reducing overlay opacity.
- Adjusted Mission Query Console layout so the action control remains visible and renamed the button to `Search`.

## What Did Not Work
- An initial attempt to rely only on fixed `max-height` tuning in panel bodies still risked hiding query controls when content grew; replaced with a flex-based panel/body layout for predictable fit.

## Validation Notes
- Ran workspace lint and test commands after changes.
