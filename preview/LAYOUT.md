# Final reference measurements and implementation

Private reference is not committed. Source is 960×1280; normalized at 402pt full phone width, so scale is 960/402=2.388 px/pt. Swift Vision OCR and Pillow/NumPy were used rather than inferred from earlier rejected images.

| Visible feature | Final reference | Implemented large DSL |
|---|---|---|
| Identity glyph tops | y616,826,1040 | 89pt card pitch (82 + 7) |
| Identity → resource label | 58–62px ≈24–26pt | 16.9pt identity row +7pt gap =23.9pt |
| Number glyph height | 30–38px ≈13–16pt ink | 18pt fee/voice,17pt flow; 9pt units |
| Numeric glyph bottom → bar | ~17px ≈7pt | metrics row bottom → bar 5pt, plus glyph descent |
| Header brand/title | red Unicom knot + white 中国联通, y540–577 | existing public PNG embedded offline; 18pt title |
| Header right | refresh glyph and 00:34 | arrow.clockwise + latest actual successful data timestamp |
| Resource headings | coin / handset / cloud + exact API titles | yensign.circle / phone.fill / cloud.fill; 10pt titles |
| Column divisions | subtle thin vertical lines | two 1×30pt neutral stacks |
| Unlimited badge | small dark inline 不限量 beside GB | inline 6pt badge, no duplicate flow value |

No resource title, value, precision, unit, per-card timestamp, suffix or alias is changed. Capture/load/query prefix, flowMetrics, flowBar and single-card path retain exact baseline hashes. The added header timestamp is derived only from result.updatedAt of cards with actual data; cache failure retains it and empty state omits it.

Official documentation https://egernapp.com/docs/configuration/widgets/ explicitly permits image src `sf-symbol:` and `data:<mime>;base64,`; it does not list HTTPS image src. Prior question-mark was an unsupported source, not evidence that the remote network alone failed. Brand uses the existing 64px PNG encoded into JS, no HTTP fetch. Preview renders that exact PNG and distinct approximate SVG symbols (iOS SF Symbol shapes differ).

`compact-preview.png` is real-JS DSL rendered into fixed 338×344pt browser frame at 3× using synthetic data. Private same-values comparison is local scratch only, preserves all three screenshot times via a frozen fixture clock and disables HTTP. Assertions cover text width and card boundaries, header/metric/bar ordering, 89pt pitch and frame scrollHeight=344. Browser preview is not native Egern acceptance. Fixed heights fence recursive flex; root spare system height remains below the complete panel, never a giant gap inside a card. Medium remains a denser responsive fallback; large is the reference match.

Limits: SF Symbol drawings/font rasterization differ from screenshot; original flow-bar semantics intentionally remain (so first remaining card can show full relative bar). No fake chevron navigation/deep link is invented. iOS outer frame cannot be shortened by JS.
