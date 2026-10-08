# Adaptive roomy cards — approved update

Rollback: `c0d5ea0082ba84596afacc7173a221f2ff76f592`, preserved on `backup/accepted-before-fill-20261008` and in a verified external git bundle. This supersedes the earlier fixed 82/86pt card-height choice; the system frame and Egern label are not modified.

Large/extra-large holder and each card use equal flex; no fixed card/holder height and no root bottom spacer. Title stays 15pt large / 16pt XL and never contains flex. Identity and metric rows retain explicit content heights and original fonts. Spare space goes to two explicit equal breathing slots (identity→metrics and after the bar); metric→bar stays 5pt. Card gaps remain 7pt and outer bottom padding 7/8pt.

Rails are 3pt: two fixed 12pt transparent corner fades and a solid flexible middle, all using documented stacks/gradients, not position/stretch/shadow DSL. Light rails use darker purple/blue/teal; dark brightness unchanged. Content left padding decreases 1pt to compensate the 1pt rail widening, preserving all horizontal text origins.

Official DSL: https://egernapp.com/docs/configuration/widgets/ . Flex distributes remaining space; nested-flex behavior follows the previously observed native Egern model. Preview simulates that behavior, including cross-axis extent for nested flexible rail, rather than auto-sizing the root. Native iPhone rendering still requires user acceptance.

`verify-adaptive.mjs` runs the actual JS with synthetic data in Chromium: large 330/344/380/402pt and XL 354/400/440pt, both modes; equal cards, full rails, 7pt gaps, no external bottom blank, ordered content, 5pt metric→bar, no text clipping/root overflow. Compatibility families also render; accessoryCircular's pre-existing width compression is recorded (the browser does not implement native minScale).

Capture/load/query, flowMetrics, flowBar, single-card hashes and all numeric/warning/time/privacy behavior remain frozen. Public previews contain synthetic data only. Browser design preview is not a native screenshot.
