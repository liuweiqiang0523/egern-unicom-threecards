# Measurement-led summary correction

Private source screenshots are not included in this repository. Width-normalized measurements use a 402pt phone width (comparison convention, not a claim about device scale): actual JPEG 1177×2560, reference JPEG 960×1280. Swift Vision OCR supplies glyph boxes; Pillow/NumPy supplies bar runs and RGB samples.

| Geometry | Actual screenshot | Reference | Corrected DSL / browser |
|---|---:|---:|---:|
| Card identity row pitch | ~106pt | ~89pt | 93pt (86pt card + 7pt gap) |
| Identity glyph top → metric-label top | ~16pt | ~25pt | 23.6pt row-box interval |
| Metric-value glyph bottom → thin-bar top, first card | ~40pt | ~7pt | ~8pt glyph/row clearance; 6pt explicit metrics-box gap |
| Left color rail | ~80pt (234px run) | short inset marker | 48pt; inset 8pt + border |
| Numeric / name / label / helper font size, large | 13 / 12 / 10 / 9pt | numeric emphasis | 14 / 12 / 9 / 8pt; badge 6pt |

The first actual identity marker samples blue (~90,167,247), second purple; the reference first marker samples purple. Published baseline JS already declares summary purple/blue/teal. Pixels prove a discrepancy, but cannot distinguish an old local JS, a different script definition, or another renderer/source; no stale-cache diagnosis is asserted and stored slots are not remapped.

Root/header remains flex-free. Large/extra-large card and holder heights are explicit, so nested horizontal metric flex cannot inflate vertical rows. A root bottom spacer absorbs the unavoidable remaining fixed iOS widget frame instead of a spacer pushing every card's bar away from its values. Small/medium retain their existing compact budgets. Capture, load/query, timestamp, cache, flowMetrics/flowBar and single-card byte-hash regressions remain intact.

`compact-preview.png` is a complete 338×344pt holder screenshot at 3× browser scale, produced from the real JS with **synthetic data**, not native Egern or an account screenshot. Browser assertions verify all text boxes stay inside cards, no horizontal clipping, header below/above metric ordering, 8pt header→metric gap, 6pt metric→bar gap and no holder scroll overflow. Egern/iOS fonts and fixed-frame rendering still need native acceptance; JS cannot shorten the system widget frame.
