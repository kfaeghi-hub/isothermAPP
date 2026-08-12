# The five sheets the model leg could not read — 2026-08-12

**Captured, not fixed.** Ruled: these are repaired OUTSIDE Phase 3, because a
benchmark that improves from reconciliation AND from shape fixes in the same
window cannot attribute the gain.

**The raw model outputs are NOT here.** They derive from client schedules and
live in gitignored `out/extraction-failures/`. What is committed is the
structural diagnosis — the shape that came back and where the contract refused —
which is what a fix is written against and carries no client content.

Regenerate: `node --env-file=.env capture-extraction-failures.mjs`

| file | class | reproduced | failure | grid | out tok / budget | diagnosis |
|---|---|---|---|---|---|---|
| `AHU-Coils1.xlsx` | shape | **no** | — | 10×31 | 1872 / 8000 | this run SUCCEEDED — the failure did not reproduce |
| `DOAS-1.xlsx` | shape | yes | contract-output | 7×25 | 2580 / 8000 | 2 row(s) without a usable tag |
| `DOAS-3.xlsx` | shape | yes | contract-output | 7×35 | 3092 / 8000 | 2 row(s) without a usable tag |
| `DOAS-coil1.xlsx` | shape | yes | contract-output | 17×41 | 3285 / 8000 | 2 row(s) without a usable tag |
| `FanCoils.xlsx` | size | yes | truncated | 199×52 | 16000 / 16000 | the response was not JSON, even after fencing was stripped |

## Row keys the model returned

- `DOAS-1.xlsx` → `area_served`, `confidence`, `descriptor`, `location`, `nameplate`, `proposed_category`, `proposed_type`, `reasoning`, `source_row`, `tag`
- `DOAS-3.xlsx` → `area_served`, `confidence`, `descriptor`, `location`, `nameplate`, `proposed_category`, `proposed_type`, `reasoning`, `source_row`, `tag`
- `DOAS-coil1.xlsx` → `ambiguity_flag`, `area_served`, `confidence`, `descriptor`, `location`, `nameplate`, `proposed_category`, `proposed_type`, `reasoning`, `source_row`, `tag`

Captured at a cost of 71.3c.