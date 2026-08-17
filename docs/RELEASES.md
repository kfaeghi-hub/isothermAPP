# Releases

The firm's running changelog. Newest first.

Every entry carries two sections:

- **For the team** — plain language, how-to-use. This is the version that goes out
  in update emails to employees and users.
- **Technical record** — the precise as-built summary: mechanisms, rules added,
  what changed underneath. For developers and for future sessions reconstructing
  why something is the way it is.

**Standing rule: every user-visible ship appends its entry here, in the same
commit series as the work.** A release note written later is written from memory;
one written alongside the change is written from the diff.

---

## Update 1.15 — 2026-08-17 (Cx Index counts the way the work arrives)

### For the team

**Document columns now count submittals, not machines.** Shop Dwgs on a
117-FCU project used to read 24% because 89 of 367 *rows* were ticked — a
number nobody could say out loud. Columns like Shop Dwgs, Equipment
Submittals, SOO and O&Ms now read **"K of N types"**: how many equipment
types have their submittal fully closed out, of the types the project has.
Partial fleets count toward N, not K — 0/14 today on Seneca is the honest
number, and the near-complete types (pumps at 28/30) are one bulk-mark or
one N/A ruling away from counting. Field and testing columns still count
per machine, as they should.

**Marking a whole type is now one action.** Click a by-type column's stat at
the bottom of the matrix → pick the type → confirm. The confirmation tells
you exactly how many units it will write ("Mark Shop Dwgs done for 114 FCU
units?"), skips not-applicable units, leaves already-done ones alone, and
records who did it. No more 117 clicks.

**New numbers, all from one rule:** every stage-group band shows its section
percentage, the top bar shows the whole project's, and each column shows its
own at the bottom of the matrix. A collapsed group's percentage now always
agrees with the row percentage beside it — it previously ignored
not-applicable rulings and could disagree.

**Which columns count which way is a project setting** — Edit Structure now
has a unit/type toggle per column. The firm default covers the 12 document
columns; Seneca's custom "SDR" column kept its old counting because it has a
custom name — flip it in Edit Structure if you want it counted by type.

### Technical record

Phase 1 of CX-INDEX-EXPORT-PROPOSAL.md (ruled 2026-08-17, all ten questions
adopted). Commits: `2f677ae` (defect fix), `00b6737` (scope column +
mapping dry-run), `52dcf53` (seed/backfill + formulas + gesture), `8a4306f`
(leg hardening).

- **One counting rule** — `src/lib/cxCounting.ts` (`classifyCell`): overlay-N/A
  and legacy `na` leave both sides; blank counts against; done-under-overlay
  counts nowhere (renders struck). rowProgress, stageState and the
  collapsed-group summary all classify through it. The collapsed summary's
  private copy ignored `cx_cell_applicability` — the §1.2 defect, fixed first
  per ruling Q7, on-screen numbers changed where it showed.
- **Scope** (Q4/Q6): `scope text check in ('unit','type')` on
  `cx_default_columns` + `project_cx_columns` (migration `cx_column_scope`);
  12 of 88 defaults seeded `type` after the owner's red pen (Panel Schedules
  reverted to `unit`); backfilled to 6 live projects × 12 columns as its own
  reviewed write, ZZ-% excluded, batch record with dry-run numbers in
  `migrations/cx-scope-seed-and-backfill.sql`. Initializer copies scope.
- **Formulas**: `columnStat` (both grains; untyped units surfaced beside
  by-type stats, never counted in them) + claims-weighted `rollup`
  (Σnum/Σden, never a mean). Section % in the bands, project-wide % in the
  top bar (Build Spec §4.1's promise), per-column stats in a sticky-bottom
  tfoot. 17 vitest cases including the measured Seneca Shop Dwgs fixture
  (unit 24% ↔ type 0/14).
- **Bulk gesture** (Q5): by-type stat cell → per-type standing → one
  confirmed act; confirmation names the count; N/A skipped; done untouched;
  `cx_cell_values.updated_by` added (migration `cx_cell_values_updated_by`)
  and stamped by both the single toggle and the bulk write.
- **Gates**: vitest 202/202 · `pw-cx-counting` 9/9 (sibling-rule leg: 0% vs
  the old rule's 14%) · `pw-cx-bulk` 10/10 (count named, exactly-N REST
  diff, all attributed, footer K/N moves, ZZ-TEST restored to snapshot) ·
  **full battery 52/52 in 14.2 min**. T7 sticky-header gate unaffected by
  the tfoot.
- The project-scope observation (Groups 10/12 milestones) is banked as
  proposal §4.5 with a named wake condition, per the red pen.

## Update 1.14 — 2026-08-17 (meeting item numbers follow their sections)

### For the team

**Meeting items now number by section.** An item under section 3 is 3.1; the
next one there is 3.2 — no matter what order things were typed in. Delete an
item and the ones after it close the gap; move an item to another section and
both sections renumber themselves. The numbers in the app, the PDF, and the
Word minutes are always the same. An item carried forward from an earlier
meeting keeps the number it had there, shown as ↺ #2 · 3.1 — the ↺ means
"carried", and the #2 says which meeting it came from. Existing meetings pick
up the new numbering automatically; nothing needs re-entering.

### Technical record

Numbers were stored text stamped at creation from a meeting-global counter
prefixed with the meeting number ("stamped once, never renumbered") — an item
created under section 3 displayed 2.1; deletes left gaps forever. Ruled:
fully-derived section-scoped numbering. One derivation
(api/_shared/meeting-numbering.ts, shimmed for the client) feeds the meetings
UI, both document formats in generate-minutes, and the dashboard's item lines.
No schema change, no data migration, zero writes to live tables — topic_id and
both sort_orders already existed; item_number persists only as the carried-item
frozen display ('' sentinel on native rows). Carried items freeze
origin-qualified ("#2 · 3.1") at carry time — derived numbers are unique only
within their meeting — and are excluded from the native count; legacy carried
numbers already encode origin and render as-is. The retention gate reversed
with the convention, old text quoted in pw-meetings; new legs: three sections
→ 3.1/4.1/5.1, delete closes the gap, cross-section move re-derives both
sections, the #2 document carries derived and frozen-carried forms.

---

## Update 1.13 — 2026-08-16 (maintenance cycle 2: the checklist documents)

### For the team

**The IST document holds its columns in Word too — all four generator
families now match their PDFs.** The CAN/ULC-S1001 document's layout was the
last on library autofit; its content is untouched.

**Site reports and meeting minutes hold their columns in Word too.** The same
table fix that repaired the checklist Word copies now covers both — open any
generated .docx in Word and the columns match the PDF's proportions instead
of re-flowing.

**The Word copy of a checklist now looks like the PDF.** Before, opening the
.docx in Word squeezed the first column until field names broke mid-word
("MANUFACT URER") and the whole document re-flowed. The tables now carry
explicit column widths that Word obeys — same proportions as the PDF.

**The column headers stopped breaking mid-word.** "Specif ied / Shop Drawi ng
/ Install ed" are now **Spec / Shop Dwg / Installed**, one line each on the
PDF even at four units across.

**Every checklist document now says when it was generated.** Footer of every
page, every copy, every mode: "Generated 2026-08-16 — reflects register at
generation." A checklist printed for site reflects the register as of the day
it was printed — now the page says so, so a stale copy can't pass as current
(that exact confusion cost a triage cycle this week).

**The two nameplate-style tables now say what they're for.** The register
matrix carries "Register record — Specified and Shop Drawing values shown
from the project register; record Installed on site"; the write-in tables
from the original checklist masters carry "Site record — complete during
test."

**The grey cells have a legend.** Under the nameplate table: "Shaded = not
applicable to this column." The shading itself was already right — grey means
the firm doesn't record that field from that source (e.g. Manufacturer is
never a *specified* value; Serial Number exists only on the installed
nameplate).

### Technical record

**D1 — docx table mechanism (generator-wide, measured in both families).**
html-to-docx declared NO `w:tblLayout` on any table (Word therefore
autofits), emitted an EMPTY `w:tblGrid` for the colspan-headed nameplate
matrix plus a SECOND mid-table grid with FRACTIONAL widths (invalid value,
invalid position), and equal-width grids elsewhere. Fix: the docx HTML
builder now returns each table's intended proportions (the PDF colgroup
numbers) in emission order, and `fixDocxTables()` strips every emitted grid,
writes ONE integer grid per table summing exactly to its `tblW`, and pins
`w:tblLayout fixed` — REFUSING WHOLE on a table-count mismatch rather than
splicing widths into the wrong table. `check_table` docx (attempted-but-
optional by gate verdict, no colspan'd first row) deliberately keeps
library grids. At ≥4 units the nameplate label column yields 28% → 22%:
"Installed" has no clean break-point, the labels wrap at spaces. Known
residual, stated: Word's own cell margins still wrap the sub-headers at
FOUR units ("Sho p Dwg") — bounded by the fixed grid now, one-line at the
common 2–3-unit counts; the PDF is clean at all counts. Word-rendered
before/after (Word COM export) beside the fix.

**IST series (owner-ruled 2026-08-17: same treatment; layout only, S1001
content untouchable).** The fourth family's grids are DERIVED, not declared:
`gridsFromHtmlTables()` (in the shared module) walks the SAME html the PDF
renders — every IST table carries inline `width:N%` on a representative row,
its table count is loop-variable (14 top-level tables from even a minimal
plan), and a hand list would restate what the html already says and drift the
first time a loop grows. Representative row = the row with the maximum
expanded cell count, so a colspan'd banner can't define a grid; unstyled
cells share the remainder; the count-mismatch refusal still guards the
derived count. Content bytes untouched — the change is `toDocx(html,
gridsFromHtmlTables(html))` at the one call site. Gate: the IST leg of
`pw-doc-docx-tables` (seeded minimal plan, real endpoint, self-cleaning);
failing-first proven (3 reds on pre-fix production). Word render of the
repaired document beside the fix; `ist-regen-gate`'s structure assertions
unaffected (the html is byte-identical).

**doc-common series (owner-ruled: same treatment, same standard).** The
patcher extracted to `api/_shared/docx-tables.ts` — ONE implementation, now
DEPTH-AWARE: the site report nests photo tables inside issue cells, so
top-level spans come from a `w:tbl` depth walk and nested tables stay exactly
as emitted (images autofit correctly). Sentinel masking is NUL-delimited and
CONSTRUCTED at runtime (`String.fromCharCode(0)`) — this file's first draft
carried literal NUL characters that rendered as ordinary spaces and defeated
review twice, the 0x08-backspace lesson verbatim, so the character is built
and never typed. `generate-checklist` now imports the shared module;
`doc-common.toDocx` takes declared grids; both `buildDocxHtml`s (report,
minutes) declare their tables in emission order with conditionals mirrored.
The IST document rides `generate-report`'s endpoint but was NOT in the ruling
— it keeps library grids and is named as the remaining same-class candidate.
Gate: `pw-doc-docx-tables` (battery #50) — mechanism legs counted by the
patcher's own bundled walker; failing-first proven (4 reds on pre-fix
production, both families); fixture meeting seeded/removed with resting state
printed. Word render of the repaired report beside the fix.

**D5 stamp (ruled: every copy, every mode).** `generationStamp()` renders the
FIRM'S calendar date (`en-CA` @ America/Toronto — UTC rolls to tomorrow at
20:00 local, and a document "generated tomorrow" reads as an error): PDF via
the shared footerBand on every page and mode (check_table included — one
toPdf); DOCX as a REAL per-page Word footer (html-to-docx 4th arg), not a
trailing paragraph. Gates: `pdf-boundary-gate` now walks all three checklist
modes and asserts the stamp legible in each PDF's extracted text on EVERY
page (band assertions unchanged — the longer footer line proven to clear the
reserve); `pw-checklist-docx-tables` asserts the stamp in the docx footer
part. Failing-first: 4 reds on pre-fix production (docx gate).

**D3 captions (ruled: option a, exact wording).** Both surfaces, both
builders, smallest type, monochrome, placed under each table's own heading so
a break cannot orphan them. Grid content untouched per the branding rule
(imperial units are the master's own words). Mode nuance stated rather than
carved out: the captions render in completed mode too, where "record
Installed on site" describes a step already taken — applied as ruled, flagged
for wording review if it grates. The deeper Field-Copy identity-dedup
question is banked as a campaign-class item per the ruling.

**D2 — ruled abbreviations** shipped in both builders, one pass. **D4 —
shading measured cell-by-cell against the def matrix in both families:
faithful** (identity spec-blocked per `__base`, Serial installed-only,
spec-only performance fields blocked right) → by-design, ruled legend
shipped, conditional on shaded cells existing. Gate: `pw-checklist-docx-
tables` (battery #49) — layout/grid/abbreviation/legend legs against the
REAL endpoint on the ZZ AHU fixture; failing-first proven (6 reds on
pre-fix production).

---

## Update 1.12 — 2026-08-14 (maintenance batch: the team's first bug list)

Seven reports from real project review, triaged cold and fixed per owner
rulings. Entries below are added as each fix lands, in the same commit series
as its work.

### For the team

**The repoint ran fleet-wide — and the register is healthier than feared.**
After Central Tech's pilot, every other real project was measured and swept:
only four more readings anywhere were stranded (one on Alexander Muir, three
on SJWS), now visible on their units. Everything else that looked like a
candidate turned out to be properly hand-entered data, which the repoint is
built to never touch. Unit Heaters on Central Tech also gained the water-side
fields so the force-flow heater readings have somewhere to land, and typing
the full phrase "FAN FORCED HEATER" now resolves directly.

**Central Tech's imported schedule data is visible (the pilot).** Every value
the old imports stored where nothing could show it — 1,059 readings across 95
units — is now on the unit: matched fields filled in with conversions shown
(P-13 reads Flow 2.3 L/s, Head 238 kPa, 575 V), and everything else under
"From the schedule" on each unit, in the schedule's own words. Nothing was
overwritten: values you typed yourself were kept, and the two places the
schedule disagreed with an entered value are named in the record. Other
projects follow after Tony reviews this pilot.

**You can now see which unit system a project is on.** Edit Project shows
"Units: metric — set at creation", with a pointer to where per-field unit
changes actually live (the Equipment tab's field structure, where changing a
unit counts the values it touches and converts them with the arithmetic
shown). The setting itself stays creation-only, deliberately — relabelling
without converting is how a GPM number becomes a wrong L/s number.

**Force-flow heaters are in the library now.** The four FFH units on Central
Tech that showed nothing in their spec table are typed as Unit Heaters (that's
what a force-flow heater is, verification-wise — same ruling that put
Clairlea's FFH units there), and typing `FFH` in the equipment type box now
finds Unit Heater directly. Their schedule data becomes visible with the
import repoint that's piloting next.

**Unit Heaters can record their water side.** Flow (L/s · GPM), Entering and
Leaving Water Temp joined the Unit Heater nameplate — the hydronic variant
finally has somewhere to put its duty. New fields apply to projects going
forward; a project already using Unit Heaters keeps its own structure and can
add the three fields in its field editor when wanted.

**Duplicated nameplate fields are fixed — and can't come back.** On a few
projects (Central Tech's fan coils were the reported case) every nameplate
field showed twice, and typing in one copy filled the other. The doubled rows
are removed — no values were lost, because both copies always pointed at the
same stored value — and the database itself now refuses a duplicate field, so
this class of bug is closed, not just cleaned up.

**The "Add Project" button no longer disappears on smaller windows.** On any
window narrower than full screen, the Projects page's filter row used to push
the "+ New Project" button off the right edge with no scrollbar — it looked
like the button didn't exist. Now the filters wrap onto a second line when
space runs out, and the button always stays on the first row, top right.

**The Cx Index header now stays put while you scroll.** Before, one screen of
scrolling left you over 88 status columns with nothing saying which column was
which. Now the stage-group bands and the rotated column labels stay pinned at
the top the whole way down, and the tag column stays pinned on the left —
scroll anywhere, you always know what you're looking at.

### Technical record

**T2b fleet — GO ruled 2026-08-14; executed same day.** The wrapper
generalized in place (`ct-repoint-pilot.mjs` → `repoint-project.mjs`,
history preserved): `--project` named per invocation, ZZ-* refused
structurally, and a fleet guard skipping WHOLE any unit whose spec holds only
declared-name values (writing `from_schedule:{}` onto hand-entered units
would brand them imported for zero gain). **Premise corrected by
measurement:** the ~456-unit estimate was the imported-row count; only 104
units carried stored spec readings, and 100 of those held declared-name
values only. Executed: Alexander Muir 1/1 (Supply CFM → strip; 76 skipped
whole), SJWS 3/3 (Number of Coils ×3 → strip; 27 human values kept; 10
skipped), West Humber and Clairlea 0 in scope (no write, no batch row),
Avondale/Seneca/Quinte/Magellan 0 candidates (never invoked). Batch-noted
per applying project; spot-check screens taken for both writes. No
deviation-stop fired; no new matcher-lineage findings beyond the two already
routed to KEEL. Both fleet guards **ratified as standing** (owner, same day);
recorded beside the additive law in ARCHITECTURE §The repoint.
**Ledger correction (owner, 2026-08-14):** the landing path for strip
readings the matcher refused (FFH/CUH flow, the unit-case seam) is NOT a
`repoint-project.mjs` re-run — post-repoint units are excluded by their
`from_schedule` marker, so a re-run is a no-op by design. They land through
KEEL's strip re-match (its ruling 3), ruled as its own explicit act when the
design note arrives. Recorded here so the next cycle does not run a no-op
and call it a fix.

**Fleet rider 2 — Central Tech water trio (explicit act on a sovereign
copy).** `apply-fleet-riders.mjs`, dry-run first, resolve-and-refuse (metric
project asserted, firm trio 9/9 resolved, zero collisions with the existing
45 rows): Flow (L/s) + Entering/Leaving Water Temp (°C) × three sections at
firm sort 19–21. Copy 45 → 54, arrival asserted, batch-noted with the
forward-only override named. The FFH readings now have a landing site once
the matcher's unit-case fix arrives (KEEL's desk).

**Fleet rider 3 — full-phrase alias taken.** `FAN FORCED HEATER` →
unit_heater through the ratified path: authed (author carried), noted to
this triage cycle, blocked-list and collision checks asserted in the act,
exact-match tier per the standing law.

**T2b — the repoint pilot (owner-ruled: pilot then fleet; fleet NOT run).**
`ct-repoint-pilot.mjs`, an invocation wrapper over the shared
`scheduleFieldMatch` (the matcher untouched — KEEL's lineage). Dry-run diff
first, then the sighted apply: 95/95 units, 1,059 raw readings — 2 written
as-is, 15 after recorded conversions, 30 refused on unbridgeable units, 1,010
moved verbatim to `from_schedule` (now visible in the strip); 161 pre-existing
declared-field values kept and 2 matcher results skipped BY NAME because the
field already held a value (the ruled additive constraint, demonstrably
firing: P-13/P-14 Voltage). Batch-tagged in `import_batches` with tallies and
arithmetic. Two findings for the fleet ruling: (1) the matcher's unit
vocabulary is case-sensitive — `L/S` ≠ `L/s`, so the FFH flow readings refuse
loudly (probe on record; matcher change = stop-and-show, not taken); (2)
Central Tech's CUH sheet speaks a condition-prefixed dialect (`82°C EWT @
11°C ΔT FLOW (Lit/S)`) the matcher rightly leaves whole; both cap the
declared-field land rate until ruled otherwise. Battery ledger: first
48-suite battery, 48/48 in 12.8 min; GENERATION 5588ms (12th reading, in
band).

**T2c — unit system display (owner-ruled: display-only).** `projects.
unit_system` was writable in the creation modal and visible NOWHERE after —
no post-creation surface even displayed it (measured: all 12 projects metric,
the toggle never used). Edit Project now carries a read-only Units line
stating the non-retroactive semantics, linking to the approach-A per-field
converter. Editable-post-creation declined per ruling. Second mirror drift
fixed on the way: `Project.unit_system` had lagged the 1.01 column, same as
`unit_imperial`.

**T6 — FAN FORCED HEATER → unit_heater (owner-ruled 2026-08-14).** Executed by
`apply-ffh-ruling.mjs` (dry-run first, resolve-and-refuse on every target):
the queue row → `mapped`/`resolved_type=unit_heater`/`ratified_at` (the
approve path's own write, verbatim); the 4 waiting Central Tech units typed
with `observed_type_name` cleared (the TypePicker's write shape), arrival
asserted 4/4; alias `FFH` → unit_heater inserted AUTHED with the ruling note
(3r history trigger records it; blocked-list and collision checked before the
write). Sovereignty proven after: Central Tech's 45-row unit_heater copy
unchanged — the seeding trigger correctly declined to re-seed. Open edge,
recorded: the full phrase "FAN FORCED HEATER" is not an alias, so a future
import saying it re-queues for one more ruling — offered, not taken.

**T4 — unit_heater water-side trio (owner-ruled 2026-08-14).** Flow (L/s ·
GPM), Entering/Leaving Water Temp (°C · °F), spec/shop/installed, appended at
sort 19–21 (additive — no layout reshuffles). A NEW §3-class gap: the
campaign's ruled §2.4 table never carried water fields, so nothing was
mis-applied. 9 rows, NOT-EXISTS-guarded (re-run adds zero — verified);
project copies untouched per the campaign's seeding rules. Record:
`migrations/unit-heater-hydronic-trio-migration.sql` + campaign doc addendum,
including the T6 interplay (Central Tech's pre-T4 copy lacks the trio until
its owner adds it per-project).

**T5 — doubled project field-defs: the class fix.** Measured: 11 (project,
type) pairs across 5 projects, every field exactly ×2; ten pairs were two
complete seeds 0.25–0.43s apart, one a manual field-add collision. Mechanism:
`seed_project_field_defs()` guarded with NOT EXISTS — a check-then-insert with
no constraint behind it — while the client-side `ensureFieldDefs` (the
trigger's predecessor, built 2026-08-04 and never retired) re-seeded from
stale React state right after the trigger had. Fix in three parts, separate
commits per protocol: (1) data repair — 308 duplicate rows deleted keeping the
earliest copy, loss-free because values key on field NAME
(`field-defs-dedupe-repair-migration.sql`, tallies in place); (2) `UNIQUE
(project_id, equipment_type, section, field_name) NULLS NOT DISTINCT` — the
refusal as a database fact — plus `ON CONFLICT DO NOTHING` in the trigger,
whose NOT EXISTS stays for SOVEREIGNTY (a project that deleted firm fields
must not get them re-seeded; ON CONFLICT alone would re-add them); (3) the
second writer retired: `ensureFieldDefs` → `ensureBaseDefs`, narrowed to the
`__base` pseudo-type (which the trigger can never seed — no equipment row
carries it), hardened to upsert-ignore-duplicates over the new index; both
type-seeding call sites removed after the ruled route proof. Mirror drift
fixed: `EquipmentTypeFieldDef.unit_imperial` had lagged the 1.01 column. Gate:
`pw-def-seeding` (battery #48) — INSERT route, UPDATE route, one-seed,
refusal by error code 23505, one-input-per-field on the real screen;
failing-first proven (refusal leg red before the index existed).

**T1 — Projects toolbar overflow.** The toolbar was `flex-wrap` below lg and
`lg:flex-nowrap lg:h-11` above it, inside a page root that is
`overflow-hidden`: with the firm's three surfaced classification filters the
row's natural width was ~1700px, so the owner-gated "+ New Project" button
(last child, `ml-auto`) was clipped at every viewport width from 1024 to
1600px — no wrap, no scrollbar. Fix per ruling: the filter group's wrapper
(previously `lg:contents`) became a real flex child — `lg:flex lg:basis-0
lg:flex-1 lg:min-w-0 flex-wrap` — so filters wrap internally while tabs,
search and the button hold row one; the bar is `lg:min-h-11` so it may grow.
Phone behaviour (RC3 disclosure) untouched. Class sibling checked per the
class law: ChecklistsPage's `lg:flex-nowrap` header does NOT reproduce — its
content is bounded (≤4 unit chips + a flexible spacer) — left alone. Gate:
`pw-projects-toolbar` (battery #47), ruled legs at 1280px and 1024px;
failing-first proven (4 reds pre-fix: overflow 419px / 675px, button never in
viewport).

**T7 — sticky Cx Index header.** The matrix's `thead` had sticky-left tag
columns but no sticky-top: measured y 309 → −891 after one scroll. Fix: row 1
(group bands) `sticky top-0 z-40` at a pinned 24px height; row 2 (rotated
labels) `sticky top-24px z-40`; the two rowSpan corner cells pinned on BOTH
axes at z-50 so header rows slide under them horizontally and body sticky-left
cells (z-20) slide under them vertically. The table moved `border-collapse` →
`border-separate` (spacing 0): Chromium drops collapsed borders from stuck
cells (crbug 702927), and every cell in the matrix draws border-b/border-r
only, so separate borders double nothing. Gate: `pw-cx-sticky-header`
(battery #46) — premise (scrollable), arrival (a row demonstrably moved), then
the header claims; failing-first proven against pre-fix production (3 reds on
exactly the header legs).

### For the team

**Importing a schedule now fills the spec table properly.** Before this, an
imported schedule's numbers were stored but mostly didn't show — the fix means
Flow, Head, Speed, Motor kW, Voltage/Phase/Hz and VFD land under the firm's
field names, with units converted loudly (the original number and the
arithmetic are always kept and shown). Everything the schedule said that
doesn't map to a firm field appears by name in the "From the schedule" strip —
nothing is invisible anymore. Columns like `MOTOR INPUT [V/Ph/Hz]` split into
their three fields automatically, and a dash stays a dash — the system never
guesses. The upload sidebar now tells the truth about cost: Excel reading uses
the AI pipeline and reports what it cost.

### Technical record

The matcher (`matchScheduleSpec`, June) was never wired into approval —
`api/intake.ts` wrote raw headings into `nameplate_extra.spec`; only
render-time name coincidence filled anything (pump set: VFD alone). Now wired
per the repoint-script shape: matched values under declared names,
`from_schedule` carries the complete verbatim read, conversions recorded in
the import-batch note, forward-only. Moved matcher+unitConvert to api/_shared
(shims at the old src/lib paths). New: `COMPOUND_ALIASES` (one column → several
fields, refuse-whole on count mismatch) with vitest coverage. New law in
ARCHITECTURE with both incident reversals quoted. Gate: `pw-approve-matcher`
(battery #45) asserts the path via the from_schedule tell. Stale "no AI, no
cost" sidebar copy rewritten.

---

## Update 1.10 — 2026-08-13 (extraction Phase 5b CLOSED; Phase 6 opens)

### For the team

**The import review now shows you what the two readers actually did.** When a
spreadsheet is read by the AI pipeline, every staged row tells you which reader
saw it, how confident the merge was, and — where the readers disagreed — both
readings, in plain language, right on the row. Where they disagreed about what
a unit IS, you choose: the row's Accept becomes two buttons, each naming a
reading, and the register records which one you took. Questions the readers
couldn't answer appear as questions — once for the sheet, or on the row they
belong to — and answering one is an edit like any other. Rows you've already
ruled on stay visible below with their record. Old uploads look exactly as
they always did.

### Technical record

**5b closed on 42/42** — the review UI over staged provenance: per-row leg and
verification chips, inline disagreement rendering with both readings, type
conflicts stripped of the generic Accept (an accept on a conflicted row always
names its reading, recorded through the edited-disposition path), questions at
both scopes, claims attribution in the edit view, settled rows keeping their
provenance, and `pw-intake-review` asserting the gates — including that a
conflicted row exposes no unnamed accept.

**Phase 6 (correction capture) opened the same day.** Opening commit
normalized sheet-level questions into `intake_sheet_questions` (one row per
question; staged rows carry only what is theirs) because capture built on N
staged copies of one question would capture N answers. Then
`correction_signals`: a SECURITY DEFINER trigger observes the existing
disposition path and freezes machine proposal + human outcome + context per
disposition — chosen_leg naming which reading resolved a conflict,
question_state distinguishing answered-via-edit from accepted-unanswered, no
insert policy so the trigger is the only author. `pw-correction-capture`
performs one of each disposition class and reads every signal back; battery
grows to 43. docs/CORRECTION-SIGNALS.md is the contract harvest Phase 1 builds
against; BACKBURNER 3r (the alias provenance-erasure fix) stands next in line,
before harvest builds.

---

## Update 1.09 — 2026-08-13 (internal: extraction Phase 5a CLOSED)

### For the team

Nothing changes on your screen with this one — it is the foundation under the
next thing. The import pipeline that reads spreadsheets with AI now runs
end-to-end in the app: every sheet is read, checked by a second pass, staged
with its full provenance (which reader saw it, how sure it was, what the two
readers disagreed on), and an interrupted import resumes where it left off
instead of starting over. The review screen where you'll rule on what the
readers found is next (5b).

### Technical record

**Extraction Phase 5a closed on the first fully green battery — 41/41, twice
consecutively.** The gate clause was the first clean 41/41; the campaign that
got there is the harness-timing arc: the sleep census (224 sites, 89 guard), the
reversed mechanical sweep (35/41, reversal on record), per-suite conversion
under the slack law with anchors landing in the same commit, and the
instrumented pw-meetings poll whose ledger now holds six [GENERATION] readings.

**The confirmation arm's answer was NO — and that is a finding.** pw-meetings at
position 2 read 6672ms, INSIDE the 4957–6717ms band from position 21, nowhere
near the 1676ms suite-alone reading. Generation cost is not positional load
accumulating through the battery; it is a property of running inside a battery
at all (cold serverless starts and shared-resource contention are the standing
suspects, unproven). The load-accumulation hypothesis is retired. All readings
sit far inside the 90s deadline; there is no product concern.

**5b opens:** the review UI over staged provenance — per-row provenance
rendering (leg, confidence, disposition), questions surfaced as questions, the
four standing type-conflicts as the first real review items, disagreement
rendering per Phase 3's rulings, IntakeReview widened rather than replaced.

---

## Update 1.08 — 2026-08-10

### For the team

**You can delete equipment on your own projects now.** It used to need an owner.
It doesn't, because the thing that makes a delete safe was never the job title —
it's what the unit is attached to, and every attachment already stops you:

- a unit with **findings** can't be deleted, and the message names which ones;
- a unit with **checklist work** can't be deleted, and now says so in plain words
  before you try, with the number of instances;
- a unit with **Cx Index progress or attachments** warns you exactly what would
  be destroyed;
- a **clean** unit — a typo, a duplicate, a wrong tag — just deletes.

**And if a delete doesn't go through, you'll be told.** Previously a refused
delete did nothing at all and said nothing — the item simply stayed on screen.

### For the architect

**Equipment hard-delete widened from governors to project members**, RLS and UI
in the same commit. The policy is `is_admin_or_dev() or is_project_member(...)`;
the button is `canHardDeleteEquipment(profile, isMember)`. Moving one without the
other produces a silent no-op, which is worse than a hidden button.

**The FK's line is the line, and it did not move.**
`checklist_instance_targets.equipment_id` is `ON DELETE RESTRICT` and refuses for
every role — stricter than a status-based rule and, unlike one, impossible for
the app to forget. What changed is only the sentence: the app counts targets and
says *"This unit has checklist work recorded — N instances"* **before** the
attempt, so nobody meets `violates foreign key constraint`. The findings
hard-block is verbatim as it was.

**Assert the departure.** RLS refuses a DELETE by matching nothing — zero rows,
**no error** — so `!error` never meant "it is gone". The delete now `.select()`s
and asserts the row count, and `pw-equipment-delete` asserts that count directly.
Banked in ARCHITECTURE as the arrival rule pointed the other way.

**The eleven-times predicate is now eleven named capabilities**
(`src/lib/capabilities.ts`). `['admin','developer','owner']` answered six
different questions in eleven files; each is now one definition with a name.
**Only equipment-delete's membership changed** — the other ten kept exact
behaviour under their new names, so the diff separates *renamed* from *widened*.
Each future widening is a one-line change in one place and gets its own ruling.

**Three harness mechanisms, each replacing a rule that had been enforced by
memory and had just failed.** `FIXTURE_PROJECTS` + `assertFixtureProject()` — a
suite may write only to ZZ-TEST or ZZ-TEST-LEED, refused by name otherwise, after
a new suite wrote a synthetic row into a real client's equipment register to test
a non-member path (removed, nothing lost, rule broken anyway). `sel()` in
`pw-select.mjs` — asserts a query's response contains the columns it asked for,
after **four** diagnoses in one day were built on queries naming columns that do
not exist. And `pdf-boundary-gate` now seeds its own Cx Plan precondition instead
of inheriting whatever `pw-cx-plan` left behind.

**Fixture repair:** the ZZ-TEST **Start Up** stage group had zero columns — a
Start-Up campaign leftover, group created and columns never seeded — sitting
first by sort order, which is why `pw-applicability-rules` and `pw-intake` both
failed pointing at themselves. Seeded from the startup family's own section
structure. `pw-applicability-rules` now picks a group *with* columns and gains a
leg asserting **no** group is empty, so the next one is a loud finding rather
than a silent landmine for whatever sorts first.

**Fix — a storage hiccup no longer throws away an extract, and no longer blames
your drawing.** A 0.9 MB drawing page failed with a `Gateway Timeout` from
storage; the object was fine and downloaded in 436 ms on the next attempt, but
the run returned nothing and the screen said *"0 page(s) read"* — which reads as
*your document had nothing in it*.

The page read now **retries up to three times** with a short backoff, and only
where retrying can help: 5xx and timeouts are retried, a 404 or 403 fails
immediately, because retrying a wrong path is just slower wrongness. A read that
succeeds on attempt two is **logged**, so storage degrading slowly shows up
instead of hiding behind the retry.

And the message now says what happened. *"Could not fetch page 9 after 3
attempts — nothing was read from your drawing, and nothing is wrong with it."*
**Never-fetched and read-and-empty are different facts about a document**, only
one of them is about the document at all, and a summary that conflates them sends
someone to re-scan a drawing that was never the problem. On a multi-page run the
good pages still land and the failures are named per page, as before, with the
fetch failures marked as such.

**A storage-privacy "breach" that was a broken premise, not a broken control.**
The battery closed at 38/39 with `pw-storage-privacy` reporting `non-member ->
200` — the account with no access being handed a signed URL. It reproduced in
isolation, so it was not contention. It was also not a breach: `dev.owner` had
genuinely become a **member** of ZZ-TEST, via a `project_members` row left behind
by a run of `pw-deliverable-access` **killed before its `finally`**. The endpoint
returned 200 because 200 was the correct answer for a member.

The leg now **asserts its own premise** — it reads the account's memberships, and
when any exist it withholds its verdict and names them and the likely source
rather than crying breach. It refuses instead of self-healing: deleting the row
in passing would erase the evidence that residue is accumulating and could
discard a membership added on purpose. `pw-deliverable-access` now also asserts
that the membership it seeds is gone, not just its probe project — its self-clean
had been checking one half of the mess it makes. Both guards were proven by
injecting the exact residue and watching them fire. Banked in ARCHITECTURE as
*assert the premise*, beside the arrival and departure rules.

### Avondale — a clean import that got almost everything wrong

**For the team.** Adam converted three Avondale schedules to Excel and imported
them. It reported success. It had typed two pumps as **boilers**, left two pumps
untyped, and written 77 spec values that nothing on screen could show.

None of it was a broken file — his sheets are clean. Four things were wrong, and
all four are fixed:

- **What a unit serves is not what it is.** The pump schedule's only prose column
  was SERVICE, which read *"BOILER B-1 PRIMARY LOOP"* — the loop it pumps, not the
  thing it is. The importer took that as the description. A duty column now fills
  **Area Served** and never decides a type.
- **The title was thrown away.** The banner row said `PUMPS`, and beside it sat an
  `ELECTRICAL` group header. The importer's rule was "a title row has exactly one
  cell", so it discarded the strongest clue in the file. It now recognises a
  banner by being nearly empty rather than by having one cell.
- **Your spec values had nowhere to appear.** They were stored under the
  schedule's own headings — `FLOW [GPM]`, `MAX INPUT [MBH]` — while the nameplate
  table shows the firm's field names. They now map across, converting units where
  needed and **saying so** (800 MBH → 234 kW). Anything with no matching field is
  shown on the unit under **"From the schedule · not mapped to a field"**, so
  nothing an import read can hide again.
- **The report said numbers where it should have said names.** *"3 columns mapped
  · 13 kept as nameplate"* reads as *it only got three things*. Every extraction —
  Excel and PDF — now names them: which columns became which fields, which were
  captured as spec, which were read and empty.

**Adam's seven Avondale units have been corrected**, recorded as a batch with the
before and after for each one: BP-1 and BP-2 boiler → pump, P-1 and P-2 now typed,
25 spec values rendering and the other 52 visible instead of invisible.

And if a sheet looks like a PDF someone converted, the importer now says so and
suggests uploading the original pages instead — a suggestion, never a refusal.

**For the architect.** The served-vs-is law is in ARCHITECTURE beside the RP
tag law, with the rejected alternative recorded: preferring the title's type on
disagreement would make correctness depend on a banner parsing, and a title is
corroborating evidence, never the load-bearing wall. Blast radius was **measured
before shipping** — all four Excel uploads in the system's history, 61 rows, every
one carrying a tag, so the row-dropping shape the change could have introduced has
never occurred and Central Tech's 54-row import parses identically.

`scheduleFieldMatch.ts` treats **the unit as part of the match**: a value is
written only where units agree or a known conversion bridges them. Two guards came
out of the dry run rather than the design — no word-containment (`VFD INPUT`
claimed the `VFD` field and overwrote "YES" with "208/1/60"), and no two columns
may claim one field (both refused, the rival named, because a tie-break is a
guess). A third catch was a silent PostgREST truncation: 1000 of 1526 template
rows, `air_separator` outside the page, previewing as "this type has no template".

**BACKBURNER 3f is WOKEN** — `docs/EXTRACTION-HARVEST-PROPOSAL.md` awaits a
ruling. Its Phase 2 gate is that the harvest can rediscover, from recorded
corrections alone, the SERVICE → area_served rule that was worked out by hand
this week.

### Extraction upgrade · Phase 2 — the model reads first

**For the team.** Schedules the importer used to read and not understand now get
read properly. On the Seneca corpus the old path typed 69% of what it extracted —
and twelve files came back with **nothing identified at all**, including all 51
VAV terminals. Those now type correctly. Where a schedule genuinely does not say
what a column means, the reader **asks** instead of guessing: 27 questions across
37 files.

A clean spreadsheet used to cost nothing to read and now costs about **10.6¢ a
sheet**. That is a real change to the per-project spend and it is reported rather
than absorbed.

**For the architect.** The contract reversal is on the record: `extractor.md` said
*"Deterministic first — the model is the fallback… proven against 33 real
schedules."* Measured on those same 33: **69% typed, twelve files at 0%.** "Proven
against 33 schedules" meant *parsed without crashing*, not *read correctly*. The
old text is quoted in place above the new — a doctrine reversal that erases what
it reversed leaves the next reader unable to check the reasoning.

**Merge extents, the datum rules provably cannot recover.** `read-excel-file`
returns a merged cell as value-plus-nulls and never reports its width, so the
header fold could not know where a group header ended and labelled column J
`MOTOR MBH`. `sheetMerges.ts` reads `<mergeCells>` from the worksheet XML; the
fold now stops at the span. **The fix is a better input, not a better heuristic**,
and the same extents go to the model, so both readers see one answer rather than
two that drift.

**One reading path, two callers.** `sheet-model-read.ts` is called by the endpoint
and by the benchmark. Not a re-implementation, deliberately: the 88/88 region gate
passed through a harness that replaced the assembly step with itself, proved the
harness, and left 87 rows in uploads nobody opened.

**The numbers — 37 files, $3.92, 10.6¢ per sheet:**

| | before | after |
|---|---|---|
| scored corpus | 3/4 (75%) | **4/4 (100%)** |
| hostile fixture | FAIL `ambiguity-unflagged` | **CLEAN**, all four clauses |
| VAV-lvl1 | 0/29 typed | **29/29** |
| VAV-lvl2 | 0/22 typed | **21/21** |
| on files it read | rules 209/298 (70%) | model 203/205 (99%) |

**And the part that is not a win, stated with it.** **Five files failed
outright** — `AHU-Coils1`, `DOAS-1`, `DOAS-3`, `DOAS-coil1` (the output did not
satisfy the contract) and `FanCoils` (truncated at the budget). The model's
205-row denominator **excludes those files**; it is not the rules' 298. The honest
sentence is: *on the sheets it read, the model typed nearly everything the rules
could not — and on five sheets it read nothing at all.* Those five are the next
curriculum entry, not a rounding error.

The bench now writes per-file results to `out/`. The first $3.92 run lost most of
its per-file lines to a `tail` in the invoking command, and a measurement that
exists only in a terminal buffer is one you pay for twice.

### Extraction upgrade · Phase 1 — the boundary

**For the architect.** Nothing model-produced now reaches the register without
crossing `api/_shared/extract-contract.ts`. This is phase one because every later
phase writes model output into an engineering register, and without a boundary
that fails loudly a malformed read lands as a **plausible wrong row** — a tag that
is really a sentence, a confidence of 4, a spec value that came back as a
structure. A shortfall is visible; a well-formed lie is not.

**Two severities, and the split is the design.** `fatal` means the read does not
hold together: nothing is written, the upload is marked failed, and the refusal
**names the field and the reason** (`rows[0].confidence: confidence must be a
number between 0 and 1`) rather than saying "invalid output". `flag` means usable
and worth a human's eye — recorded, never silently dropped.

**A prior ruling is preserved deliberately.** A `proposed_type` outside the firm
vocabulary is **not** fatal: `api/intake.ts` already degrades it to "unknown" so
one invented type cannot throw away nineteen good rows. What changes is that the
degradation is now **visible** instead of silent. Unrecognised units are flagged
the same way and the value is kept **as written** — a boundary that refused
`[ ' w.c.]` would refuse a perfectly good Avondale boiler schedule.

**29 injection tests.** Every case is damage handed to the checker on purpose,
because a boundary that has never refused anything is a function that has only
ever been called with good input. Including the one that matters most: a read
whose rows are *all* lost is refused rather than reported as "0 rows" — a failure
wearing an empty result's face is the intake defect this codebase already fixed
once.

**`budgetOverride` is deleted.** It read `opts.budgetOverride ?? Math.min(…)` two
lines under the comment *"the number still comes from the registry, not the
caller"* — Law 4 stated in prose and contradicted by the line beneath it. **No call
site ever passed it**: a loaded footgun in dead code, removed rather than guarded,
on the empty-Vercel-project precedent. The retry's `budget *= 2` is **not** the
same thing and is untouched — *"the ceiling is unchanged at 8,000 with the 16,000
retry"* is a ruling the calibration campaign depends on.

**Every model call now has a timeout** — 240s, a backstop rather than a deadline,
under intake's 300s ceiling and above anything this system has been observed to
do. There was none at all: a bare `fetch`, so a hang ended as a platform kill with
no message and no logged outcome. Self-verification doubles the calls per page,
which is why this closed before that lands rather than after.

**`api/` joined the unit suite.** The vitest include was `src`-only, so a test
written beside a serverless module was silently never run — the same shape as a
gate reporting a pass on a corpus that was not there. 132 unit tests, up from 103.

**Gate, both halves.** Malformed reads refused by injection ✓. No behaviour change
on the PDF path — **asserted, not assumed**: one real extraction (~4¢) through the
new boundary returned 3 rows with both paths agreeing on every tag and every type.
Benchmark unchanged at 75%, which is the correct result — Phase 1 hardens the
model path and the benchmark measures the deterministic one.

### The extraction target now has a number

**For the architect.** Every extraction fix so far was argued from one file. There
was no way to say whether extraction as a whole was getting better, because there
was no measurement. `extraction-bench.mjs` is that measurement, over 37 real
schedules — Adam's three, the 33 Seneca files the parser was first proven against,
and one committed synthetic fixture.

**Baseline, deterministic path only: 3/4 scored files clean (75%)**, against a
target of ≥90%. The corpus survey is the more useful half: **286 rows across 33
Seneca schedules, 69% typed — and 12 of those files return 0% typed**, 86 rows of
ordinary VAV terminals, DOAS units and an energy-recovery wheel that the rules
extract and cannot identify. That is the measured case for model-first reading.

Scored and surveyed are counted separately and both numbers always print. A file
is scored only against truth **written by hand from the sheet** — expectations
recorded by running the parser and keeping what came out assert that the code
still does whatever it does, and this repo has paid for that lesson twice. A rate
over 4 files must never read as a rate over 37.

**The hostile fixture earned its keep on its first run.** It fails on exactly one
clause — `ambiguity-unflagged` — because the deterministic path has no mechanism
to flag an ambiguity at all; the requirement is real and unmet, and naming it is
what makes the next build measurable. It also found a defect rules cannot fix:
`MBH` in column J was labelled `MOTOR MBH` because forward-fill carries a group
header past its own merge, and `read-excel-file` never reports a merge's width.
The extent is not in the data the rules are given.

**BACKBURNER gains 3l** (document-set context — read the legend page first,
cross-reference units across pages, validate against the drawing index) **and 3m**
(full-document intelligence — specs and sequences cross-checking the schedules, so
import becomes billable design review). Numbered 3l/3m rather than 3k/3l: `3k` is
the half-onboarded account trap and is occupied.

`docs/EXTRACTION-UPGRADE-PROPOSAL.md` carries the model-first build plan, six
gated phases, grounded in a nine-subsystem recon that found **five of the
requirements have no foundation yet** — no structured outputs or tool-forcing
anywhere, a verifier that only takes prose, no second-reading model, no ambiguity
surface in intake, and no Node-side workbook read. Cost is stated before it is
spent, and reported at every phase boundary.

**Closing gates:** battery 41/41 · `pw-equipment-delete` 9 checks,
`pw-intake-retry` 11, and `pw-schedule-coverage` 14 through a real login ·
`avondale-schedule-gate` 34 over the three real client files (skips loudly by name
when they are absent) · `pw-storage-privacy` green with the premise guard fired
and cleared · 103 unit tests · real build (`tsc -b`) clean · tree clean.

---

## Update 1.07 — 2026-08-09 · IST MODULE SHIPPED

### For the team

**The IST module has shipped.** Integrated Systems Testing to CAN/ULC-S1001 —
the service the firm already performs and issues reports for — is a module now
instead of a Word document. A project has an **IST tab** holding the plan
revisions, the participating systems, the integrations between them and the test
protocols; a **field mode** for recording a witnessed test on a phone, offline if
the building has no signal; and it **generates the Plan and the Report** in the
structure the standard specifies.

The bar it was built against was the firm's own **Scarborough Gardens Arena**
report. That document turned out to be CAN/ULC-S1001 Appendix C section for
section — not a house style but the deliverable the standard asks for — so the
system is checked, every time the test battery runs, against its ability to
reproduce that structure from data.

**Why it matters beyond one project:** the Ontario Fire Code changed on
2026-01-01. Buildings whose fire protection or life safety systems were installed
or modified on or after 2020-01-01 now have to have integrated testing completed
and **documented and available**, and every tested building comes back at one
year and then every five. This is recurring work with dates attached, and the
module is being built so those dates land on the dashboard like everything else
the firm owes.

### For the architect

**IST module, phase 1 — schema + integrations/protocols CRUD.** 11 tables, RLS on
the established member/lead shape, an `IST` project tab, and `pw-ist` (20 checks)
in the battery from birth with wait helpers throughout. Full design:
[IST-MODULE-PROPOSAL.md](IST-MODULE-PROPOSAL.md).

**The schema's shape came from the firm's own issued report, not from a reading of
the standard** — and the two disagreed in a way that mattered. The three
attachment tables are **not the same shape**: A-1 enumerates *condition types*,
A-3 enumerates *units*, and A-2 enumerates *points* with an equipment-type code,
stacks several devices under one numbered row, and switches shape mid-attachment.
So `ist_protocols.subject_kind` is `condition | unit | point`, and a CHECK
constraint enforces which companion columns each kind may carry — **which is what
makes the column mean something rather than merely be recorded.** A model assuming
one shape would bend the firm's document.

Two more things modelled from the document rather than assumed: **a result carries
its own date, distinct from its session's** (table B-2 is one signed table holding
rows tested on two different days), and **sign-off is per attachment table, not
per report**, with participants differing per session.

**Notes are a table, not a column.** Table B-3's note spans five rows, cites a
spec section, states an apparent non-conformance and then carries two named
engineers' written determinations resolving it — and **REV2 of the whole document
exists because of it**. A determination that changed a revision is not a comment.

**Four guards, each demonstrated REFUSING in `pw-ist`** rather than merely
existing: the kind/companion-column shape (3 refusals proven), an integration
pointing at itself, a scoped note with no target, and a second result for the same
protocol in one session. **A constraint nobody has seen reject anything is a
comment with syntax.**

**A correction the module made to its own foundation.** BACKBURNER 3e said IST
deficiencies would file with `origin = 'ist'` because that value was *already in
the origin set*, and the proposal repeated it. **It was not there** — the enum
held `site_visit, ivc, pfc, fpt`, later `design_review` and `startup`. The
migration's first draft *asserted* the value's presence and refused to run, which
is the only reason the claim was checked before a deficiency tried to use it —
and a deficiency is raised in the field, mid-test, which is the worst possible
place to discover a missing enum label. The migration now adds the value and
re-asserts it, because `ADD VALUE IF NOT EXISTS` is silent when it is a no-op.

**8 new role types** minted as ordinary admin data (16 → 24), including
**Integrated Testing Coordinator as a distinct seat** — the standard requires a
P.Eng or a ULC-listed individual at an authorized service provider, and on some
projects that is not this firm. It is never a CxA synonym.

**Phase 2 — the integrations matrix and the pre-IST checklist.** Each integration
now carries a **status chip**, and the chip that shouts is `UNTESTED` — filled
amber, the only loud one on the screen. That follows the ruling's own argument
for the tabular form: *an integration that does not exist is not interesting; one
that exists and was not tested is.* `Pass` is deliberately quiet, because a
screen that shouts about its good news trains people to stop reading it.
`NO PROTOCOLS` is a separate state from `UNTESTED` on purpose — both are zero
results and they mean opposite things: work not yet planned versus a plan not yet
executed. A protocol counts as tested only when **both** Normal and Off-Normal
carry a verdict, since half of an S1001 test is not a tested integration.

**§9.1's 22 prerequisites are firm data, not this project's data** — a firm-level
default list copied into a plan by `ist_seed_prerequisites()`, idempotent, seeded
at N/A. A function rather than app code because three surfaces will eventually
create plans, and a rule that lives in one call site is a rule the other two will
not have.

**The link is the phase, not the list.** `document_id` now references
`documentation_register`, and a CHECK **refuses** a prerequisite marked YES with
no document attached. NO and N/A with nothing attached stay legal — those are
honest states; it is the *claim* that needs evidence. **This is the
known-good-handoff boundary made operational:** per-unit readiness stays the Cx
Index's, and document prerequisites are checked here against real documents
rather than against a tick.

**Phase 3 — session field mode.** A witnessed test, recorded live on a phone.
One protocol per card, 44px verdict targets three across, the observed note and
the date out of the way until needed, and a sticky bar carrying the only two
facts that matter mid-test: **how many are done, and whether the device is
online**. A card is complete only when **both** Normal and Off-Normal carry a
verdict — the same definition the matrix chip uses, deliberately, because two
screens disagreeing about what *tested* means is how a green matrix ends up
sitting over an unfinished test. The per-result date defaults to the session's
and stays editable, because one signed attachment legitimately holds rows tested
on different days.

**Offline reuses the existing outbox rather than growing a second one.**
`ist_results` already carries a unique key on `(session_id, protocol_id)`, which
is exactly the natural key that queue requires: re-tapping a verdict REPLACES its
queued op instead of appending, so a long session cannot grow an unbounded queue,
and a replayed flush lands one row with last-write-wins. Photos ride a finding
with `origin = 'ist'` — a photo in an integrated test exists because something
failed, and a deficiency belongs in the findings register, never in a parallel
store.

**A defect that shipped green, and the hole in the suite that let it.** The IST
tab read **"No IST plan yet"** over a row that existed. The phase-1 policy
generator had emitted a `select` on `ist_plans` **inside `ist_plans`' own
policy** — `infinite recursion detected in policy` — so the table read as empty
to every real user and the feature was unusable from the moment it shipped.

`pw-ist` was **28/28 green throughout**, because every check spoke through the
**service role key, which bypasses RLS**. Eleven tables, five constraints, six
proven refusals: all true, all irrelevant to whether anyone could see the data.
**A suite that only ever speaks as the service role cannot see an RLS defect.**
Found by the render-and-look gate at phone width — the third time render-and-look
has caught what the assertions could not. The policy is corrected in its own
migration, the phase-1 file annotated rather than silently rewritten (a history
that quietly disagrees with what ran is worse than an ugly one), and `pw-ist` now
runs its RLS section **as the employee account** — not the admin, whose
`is_admin_or_dev()` short-circuit would hide the same class of bug.

**Phases 4 and 5 — the documents, and the team.** The IST **Plan** and **Report**
generate from one skeleton in two modes, because the standard says the report
*consists of* the plan plus the collected documentation plus the forms — two
generators would drift, and the first thing to drift would be section numbering,
which is what an AHJ reads the document by. Plan mode emits the blank Attachment
A forms; report mode adds the executive summary, the pre-completed table, the
life-cycle log and Attachment B carrying results and sign-offs.

**The generator is hosted inside `generate-report.ts` behind an explicit
`document: 'site' | 'ist'` allow-list**, with unknown values refused loudly. That
is not tidiness — `api/` is at the platform's 12-function ceiling, which is
physical, and an allow-list inside an existing function is this codebase's
established answer to it (the same reason `intake.ts` hosts the agent calls). The
file's header says so, so the next reader finds the ceiling instead of inferring
it. Portal consolidation stays parked as its own session; its entry now records
that **slot pressure is real** — two features routing through shared functions.

**The gate is a faithful Scarborough regeneration**, and it is a battery suite:
`ist-regen-gate` seeds the real content and asserts **15 structural facts** — all
13 Appendix-C sections present and in order, **three** attachment tables from
**nine** matrix rows, six sign-off blocks, `Equip. Type` on the sprinkler
attachment only, the B-3 note surviving with its author, per-result dates
differing inside one signed report. Building the fixture caught a real error: the
first draft rendered one attachment per integration, which would have produced
nine attachments and nine sign-offs where the firm issues three. Counting against
the real document caught it; a single page looked plausible.

**Team seeding presents rather than inserts.** On a project whose scope includes
`CAN/ULC-S1001 IST`, the Team tab shows a **Needed for IST** group listing the
seats with no company assigned — each one tap from a real assignment, and each
disappearing as it is filled. No phantom rows: the matrix is company-first, and
**an unfilled seat is an absence to show, not a row to fabricate.**

*A withdrawal worth recording:* the first attempt seeded rows directly and could
not — `project_team_assignments.company_id` is NOT NULL and the matrix groups by
`(role_type_id, company_id)`. The proposal had said seats were "role rows
awaiting contacts"; the schema said otherwise. The seeding function was **dropped
rather than left failing**, because a function that exists and cannot succeed
reads as available.

**Correction — evidence became a reference, not an upload.** The pre-IST
checklist first required a document *in the app* before an item could be marked
received. The model was wrong for the firm: documents live in ShareSync, and the
app is the record of testing. Marking an item YES now opens one field — *Where is
the supporting document?* — and the status and the reference **save together, in
one round trip**, because a two-step flow is a flow that gets abandoned standing
in a mechanical room. Pointing at a register document still works, for the future
portal case. The reference prints in the generated §9 table, which is what the
issued report does anyway: it *names* its pre-completed documentation rather than
embedding it. **The document had been describing the right model all along.**

Recorded in the Build Spec as §4.4, because it generalises: **a claim must name
its evidence; it does not have to own it.** Audited across the system — this was
the only place the assumption had been built. And the constraint's raw text no
longer reaches anyone: `src/lib/plainError.ts` maps it to a sentence, unit-tested
against real PostgREST messages. *(That extraction exists because the browser
suite could otherwise only assert it with a `check(true, …)` — a check that
cannot fail, which this codebase treats as a defect, not a placeholder.)*

**The generation door.** The IST tab now has a **Generate** action at the top of
the plan view — deliberately above the working sections, because the generator
and endpoint were proven at 15/15 while the button did not exist, and **working
code nobody can start is not a shipped feature.** Each mode states its purpose on
the choice itself rather than behind a name: *IST Plan — protocols and blank test
forms, for issue before testing*; *IST Report — results, test log and executive
summary, for issue after testing.* Both produce the PDF + DOCX pair through the
same pipeline as every other document.

**Guards that offer rather than block.** Report mode with no results **warns**
and generates anyway — a dry run or a partial-progress issue is a legitimate
thing to want, and the warning makes the state known so the human decides. Plan
mode with no protocols is refused, because that is not a partial document but an
empty shell, and it says which piece is missing.

**Rule 4 is enforced by construction.** Generating marks a revision issued;
generating again from an issued revision creates the **next** revision — a full
copy carrying its systems, integrations, protocols, prerequisites, sessions,
results and sign-offs — and leaves the original exactly as issued. Scarborough is
REV2 because a determination arrived after REV1; a system that regenerated over
REV1 would have destroyed the only evidence that the determination changed
anything. The plan view shows what was generated, in which mode, and when.

**Discoverability is asserted, not assumed:** `pw-ist-generate` fails if the
control is not inside the first viewport of the plan screen. *"It is on the page"*
and *"it is on the screen"* are different claims and only the second one counts.

*A field report against this, and what it changed.* The owner reported the
Generate control missing on production. It was a **timing shadow**: the report
landed inside the ~110-second window in which a hard refresh still serves the
previous build, and the control was present, correct and error-free in the
deployed code. **No product defect — and the check still owed something.**
`pw-ist-generate` had always *clicked a plan* before asserting, so it only ever
answered *"is this findable once you know what to do"*; it had never tested the
**cold landing** — arriving on the tab with a plan auto-selected and no
interaction — which is the state every real user meets first and the one the
report came from. It had also only run as the employee, and the reporter was the
admin. Both legs added for both accounts. **An incident a check did not cause is
still evidence about that check.**

The protocol gained one line for reporters: **before reporting a just-shipped
feature missing, confirm the served bundle hash postdates the push** — one
`curl` and a grep, cheaper for the reporter than a diagnosis is for anyone.

**Closing gates:** battery 37/37 · `pw-ist` 44 checks — five guards proven
refusing, RLS proven as a real user, outbox replay proven idempotent, the seat
list counted against its declared 18 · `pw-ist-team` 6 checks through a real
browser login · `ist-regen-gate` 15 structural checks against the issued report ·
render-and-look at 360 / 390 / 1280 · real build (`tsc -b`) clean · tree clean.

---

## Update 1.06 — 2026-08-05 · CLOSED 2026-08-06

*Ruled as "1.05" on the night; 1.05 was already spent on the extractor
calibration campaign, so this took the next number. Two rulings: the document
identity went monochrome, and the Start-Up family was built. Both are done.*

### For the team

**There is a fourth kind of checklist now: Start-Up.**

Alongside IVC, PFC and FPT, every piece of equipment can carry a **Start-Up
checklist** — the record of the machine being run for the first time. It has its
own tab, its own counts, and **69 equipment and system types are covered**, from
boilers and chillers down to wall fin and water meters.

**What a start-up checklist is for, and how it differs from the others.** An IVC
says the unit was installed correctly. An FPT says the sequence works. A start-up
says *the machine was brought to life, and here is what it did* — the safeties
were tripped and proved, the readings were taken, and two people signed for it.

**The contractor performs it. You witness it. Both sign.** That is printed on the
form in full, and the wording matters: the contractor certifies the work was
performed; your signature says you **witnessed** it and **does not transfer
responsibility for the work**. Those two sentences are on every start-up
document.

**There is a fourth answer: HOLD.** Y, N, NR — and now **HOLD**, for when the
start-up *cannot proceed*: no permanent power, no water treatment, no gas.
A blocked start-up is not a failed one, and recording it as N would make it read,
a year later, as work done badly rather than work that could not be done yet.

**Some forms open with a warning banner.** Where a form carries a safety
instruction — the transformer's *"Equipment to be isolated from all sources of
power"* — it prints as a **bold banner above the first section**, not as a line
item. You read it before you touch anything, rather than ticking it after.

**Every checklist now has a Safety Device Verification section and a Readings to
Record section.** These are new. The old forms checked that a device was
*installed*; these prove it **trips**, and record the number. Flame failure
closes the valve *and* the closure time gets written down.

**Where a check belongs to a different document, the form says so.** Fire alarm
devices show as *installed and operable* with a note that the alarm response is
proven in integrated testing. The form no longer claims work that belongs to IST
or to acceptance testing.

**And the documents are black and white now**, per the identity change earlier in
this release. The only colour left on a generated document is colour that means
something.

**The start-up list got shorter, and nothing was lost.** The family first shipped
with the same checklist under several names — the pump form appeared thirteen
times, once for each water system whose folder happened to contain it, and the
boiler form three times. **113 start-up templates are now 76.** When you pick a
start-up checklist you see one *Pump Start-Up Checklist*, not a choice between
*DOMESTIC WATER SYSTEMS* and *PURE WATER SYSTEMS* that were the same form. The
system a pump serves is on the equipment record, where it belongs; it was never a
different checklist. Every merged form's source is still recorded on the survivor.

**The boiler form learned steam.** Water column, gauge-glass blowdown, the
two-cutoff low-water behaviour a steam boiler needs and a hot-water one does not,
the safety-valve lift *and reseat*, and the pressure and conductivity readings.
On a hot-water boiler those rows answer **NR** — one form, not two.

**Two forms were filed under the wrong equipment and are now right.** A supply
fan form was sitting under Air Handling Unit, and a fire pump form under Pump.
Both offered the wrong checklist and the wrong nameplate block to whoever picked
them. There is also a new type — **Compressed Air Dryer** — which had been
sharing Air Compressor's file; a dryer is a different machine with a different
duty and a different way of failing.

**And one form turned out to be a different machine entirely.** The checklist
filed as *COMPARTMENT UNIT SYSTEM* is a **built-up air handling unit** — the kind
assembled on site from sections rather than delivered as one packaged box. It has
its own type now, *Built-Up Air Handling Unit*, and the old name *Compartment
Unit* still finds it, so an older specification using that term will resolve.
Its checklist also got its headings back: the form's three sections — general
construction, filters, cooling coil — had been flattened into one long list when
it was first imported, and they read as sections again.

### For the architect

**Two rulings, one release.**

**Document identity → monochrome.** `DOC` moved to a grayscale ramp;
`DOC_SEMANTIC` untouched and now the only colour in a generated document. The
finding that justified the verification design: with every value in `DOC`
monochrome and `grep -r` over `api/` clean, **the Cx Plan still rendered
purple** — its heading identity was Word style definitions inside a committed
binary. Recorded as *identity can live in a binary; source is not the artifact*.
A later render-and-look found a **blue footer** the same grep had passed, which
is the standing limit of a retired-value list: it can only find values somebody
already knew were retired.

**The Start-Up family.** Full record in
[STARTUP-CAMPAIGN.md](STARTUP-CAMPAIGN.md), flipped to as-built with its
departures table. Headline numbers: 81 masters mined at UNEXPLAINED 0 · 678
placement items ruled · 8 Phase 2 batches · 20 types minted · **113 templates,
3,123 items, 67 of 68 types**.

**Schema:** `startup` on `checklist_type_enum` and `finding_origin_enum`;
`yn_nr_na_hold` as a new `status_type` with the pairing CHECK guard-proven
3/3; `prestart_banner` + its instance snapshot; `kind` on the type register
with a **DEFERRABLE INITIALLY DEFERRED** mixed-kind targeting trigger, also
guard-proven 3/3.

**Four laws recorded in ARCHITECTURE**, each with its incident: *identity can
live in a binary* · *a pattern is verified by executing it, never by reading it*
(a Python `\b` became a literal backspace and survived two greps) · *a new
permission is audited in the batch that introduces it* (four fires, one author) ·
*template content law — universal first, convergence earns the item*.

**Guards added and demonstrated firing**, not merely written: the HOLD pairing
CHECK, the mixed-kind targeting trigger, the convergence assertion, the
firm-practice sole-anchor refusal, the empty-section-needs-a-reason refusal, the
gap-fill-never-creates-a-template refusal, and the collision tripwire that caught
23 of 81 masters being silently overwritten.

**Regression found and fixed at the cause:** re-zipping the Cx Plan skeleton
added four directory entries Word never wrote, and `pw-cx-plan`'s hand-rolled
PK walk then read an empty document and failed five content assertions on correct
content. Fixed by restoring byte-layout parity rather than by patching the
reader; the naive-walk hardening is on the residue list under the touch-policy.

**Template hygiene pass (`hygiene-2026-08-06`)** — diagnosed read-only, ruled,
then executed from a ratified artifact: **113 → 76 startup templates** (77 after
the main pass, 76 after the 7c follow-ups), six true
duplicate clusters merged 30→6 with the **union of provenance** preserved in
`revision_label`, boiler 3→1 *after* twelve steam-conditional rows were seeded
(merging first would have locked in a wash-out), pump 13→1 at 45 items with five
adopted conditional rows and a sixth recorded as already-covered, `air_dryer`
minted, two mis-keyed templates re-keyed. `ivc`/`pfc` untouched. The applier's
unaccounted-row refusal **fired on the first run** (16 rows) and was answered
with an enumerated alias list rather than a looser matcher — a matcher able to
absorb those would also swallow rows that genuinely differ. The one live
instance's five snapshot columns were re-read after the write and are
byte-identical: Rule 4 proven, not asserted. Full record:
[TEMPLATE-HYGIENE-PROPOSAL.md](TEMPLATE-HYGIENE-PROPOSAL.md) § As executed.

**Hygiene 7c — the two follow-ups, ruled and executed the same day.** The
`fire_pump` husk was **deleted** after its mine artifact was read and shown to
have yielded zero checklist rows (its one section-A row carries
`"standing_item": true`); its master path is unioned onto the drafted survivor so
the record that a sprinkler-tree master mined empty survives the template.
**`ahu_builtup` minted** — *Built-Up Air Handling Unit*, alias `Compartment Unit`
seeded exact-match — and `COMPARTMENT UNIT SYSTEM` re-keyed to it, which leaves
`ahu` a single template. **113 → 76**, 69 types.

**The coil repair, and the correction inside it.** The proposal read four
repeated rows as two coil blocks and recommended `HEATING COIL:` / `COOLING COIL:`
prefixes. Reading the raw source refuted both halves: the master has **three**
content tables (general construction, filters, cooling coil) and **no heating
coil at all**; the repetition is a second piping group inside the single cooling
block, and three checks repeat, not four. So the repair got larger and more
accurate — the mine had dropped **every** block heading, and all three are now
restored as prefixes, with the two piping groups distinguished as *first* and
*second* because the source shows two and names neither. The applier reads the
headings out of the source artifact rather than carrying its own table, and a row
it cannot place in a source block is a refusal (50/50 placed, zero refusals).
Recorded in ARCHITECTURE as the phantom-data mirror: **eager dedup deletes real
structure; the cure for apparent duplication is reading the source, not
collapsing the rows** — inventing structure and deleting structure are the same
mistake in opposite directions.

Carried forward as its own act: `fire_pump`'s nameplate defs. The deleted
master's eleven-field table was held out of the deletion and proposed separately
(`proposals/fire-pump-nameplate-additive.json`, **unratified**) — five additive
identity fields, because `fire_pump` carries 37 duty-and-controller defs and **no
identity block at all**: it can say what a fire pump is rated to do and cannot
say which machine it is.

**The naming law** comes out of that pass and is now standing for every family:
`<Type display name> — <qualifier>`, display name from the **register** and never
from the source document, qualifier only to distinguish siblings.
*A qualifier that does not change the checklist does not belong in the
checklist's name.* Enforced mechanically — the applier refuses a name that does
not open with its type's register name.

**Fix — site report PDF bled into the page footer.** On a multi-page report the
last table row on a page was painted **inside the reserved footer band**: measured
at y≈749 on a page whose content box ends at 739.2, i.e. 10px into the disclaimer,
on five of nine pages of a real report. Two of the three usual suspects were
already correct and are not the cause: rows never split (`break-inside: avoid`
works) and `thead` already repeats on continuation pages. The cause is that
Chromium places a row whose CONTENT fits and lets its padding and border overflow
the content box; the old 0.55in reserve left the footer's rule ~2px below that
edge, so any overflow landed on it. Three structural fixes were built and measured
and **all three failed** — bigger margin alone, `border-collapse: separate`, and a
repeating `tfoot` spacer.

The fix is geometric and has two halves that only work together: reserve more than
the footer needs (`PDF_BOTTOM_RESERVE = 0.72in`) **and** sink the footer's rule to
the bottom of the band (`FOOTER_SINK_PX = 20`). Reserving more space alone just
moves the collision, because the footer still starts at the top of the band — the
allowance has to sit ABOVE the ink. A shared `footerBand()` wraps every family's
footer so the allowance cannot be reserved in one document and painted over in
another; `generate-checklist` keeps its own deliberate `toPdf` (landscape +
per-mode footers) but now **imports** the geometry rather than restating it.

**Two new tools, and the gate joins the battery.** `pdf-boundary-measure.mjs`
rasterises a PDF through pdfjs inside Chromium and reports where rules land
relative to the footer; `pdf-boundary-gate.mjs` regenerates one document per
family and fails if any table rule reaches the footer's rule. The gate is now a
battery suite: **the bug shipped because every existing gate looked at document
CONTENT and none looked at page BOUNDARIES.**

**Verified on real data without touching an issued record.** Ruled: the issued
Muir and Clairlea PDFs are not regenerated — they keep the bleed as a
point-in-time artifact of when they were made, exactly like any issued revision,
and a re-issue would regenerate as a new rev through the normal flow. Clairlea was
instead rendered locally against the working tree with `uploadDocPair` swapped for
a disk writer, the row's storage columns restored **and re-read to prove it**, and
the issued object confirmed still in storage.

**Harness: a concurrency lock, and a guard that was crying wolf.** `run-battery`
now takes a lockfile for its run and passes a token to the suites it spawns;
every other entry point — suites, sweeps, gates, calibration tools — refuses
while it is held and names the run holding it, with a logged `--no-harness-lock`
break-glass. Its header had asked for this in prose for months and was violated
twice in one day by its own author, which is the third law this session to reach
the same conclusion: **a rule that depends on being remembered mid-session is not
a rule yet.** Proven firing in all four states, including the first version of the
test that wrongly passed.

Separately, `openTestProject` was refusing on nine suites. It waited for
`.first()` to become visible; the dashboard now names the test project 72 times
and the first DOM match is a hidden `<span>`, so a project plainly on screen read
as absent. It now navigates to the projects list — the surface its own refusal
message always named — waits for a **visible** match, and reports how many DOM
matches existed when none were. The refusal is not weakened. **The nine were
first attributed to concurrency, which was wrong**; recorded in ARCHITECTURE as
*yesterday's cause is the most seductive wrong answer for today's symptom*.

**Fix — dashboard card headings overlapping their own subtext.** On cards 6, 7,
8 and 10 the explanatory grey line collided with the heading and clipped, worst
where it wrapped. Not a fixed height and not absolute positioning: `ClauseHead`
already draws a `border-b`, and those four cards wrapped it in a second
`border-b` and then rendered their own note with `-mt-1`, pulling the text up
into a rule painted through the middle of the header. **The correlation was
exact — the four broken cards were the four that rendered their own note**;
1–5 and 9 were always fine because they let the shared component do it. Same
class as the radar labels and the footer band: *content painted where another
element's space was never reserved.*

Fixed at the component, not per card: `ClauseHead` now owns the note. One block,
one border, normal document flow — the title row wraps (`flex-wrap`, `gap-y-1`)
so a count or rule drops to its own line instead of overflowing, the note sits
on `mt-1.5 leading-relaxed`, and a long note wraps to as many lines as it needs
and pushes the body down. **No negative margins, no fixed heights on text that
can wrap.** A layout decision that existed in four copies now exists once.

Verified by render-and-look on the real build (`npm run build` + `vite preview`,
so the working tree is what is judged) at **390 / 1280 / 1440 / 1920** — every
numbered header clean, mobile wrapping to two lines and pushing the body down —
plus a regression pass on the earlier Follow-up Radar label fix at the same
widths, which holds.

**Closing gates:** sweep CLEAN at 20 retired values across all families including
both startup modes · boundary gate PASS across report/minutes/cx-plan/checklist ·
battery 32/32 · tree clean.
## Update 1.05 — 2026-08-04 · field-tested 2026-08-05

*Field test **passed**: the full flow walked on Clairlea and Workman — upload,
find pages, confirm, extract, review. Battery 31/31. The extractor calibration
campaign is closed; its record is
[EXTRACTOR-CALIBRATION-PROPOSAL.md](EXTRACTOR-CALIBRATION-PROPOSAL.md).*

### For the team

**Dragging a big drawing set in shows you everything it found.** A sheet with
four schedules on it becomes four tables, and the app now tells you *"2 pages
split into 10 tables — 95 rows in total"* before opening the first. Previously it
opened one and said nothing about the rest, which made a page that read perfectly
look like it had barely read at all.

**Nothing gets pre-ticked on a guess.** If the page-sorter can't run — it happens
on sets with a lot of scanned sheets — pages are still offered to you, just none
of them pre-selected, and the app says so. A page only arrives ticked when there
is real evidence for it.

**Typed equipment always gets its full nameplate.** Units created by intake used
to show only Manufacturer / Model / Serial. Every typed unit now renders its
type's whole field set, empty and ready, on every project. **You fill nameplates;
you never have to build them.** 323 fields were backfilled across existing
projects.

### Technical record

**F3 — def seeding is structural.** `api/intake.ts` mentioned
`project_equipment_field_defs` zero times; `ensureFieldDefs` lived in
`EquipmentPage.tsx` as a client-side UI event handler. So intake typed units
correctly and never seeded the template the nameplate reads — the
retroactive-typing lesson recurring through a different door. Fixed with a
**database trigger**, not another call site: intake approval, picker,
retroactive ratification, manual assignment and every path not yet written.
*Calling one function from N call sites is a rule the N+1th call site breaks.*
Census: 9 (project, type) pairs, 323 def rows; zero pairs remain missing;
mechanism proven in both states. Product rule in the Build Spec.

**F2 — assembly, not extraction.** The ledger showed production had run the
splitter and the amended budget class and returned **88/88 on p17 through the
real endpoint**. `onStaged(staged[0])` showed one of ten uploads. Fixed by
stating the total before the review opens.

**F1a — the pre-tick violation.** `picked` still read `p.titled` after the
verdict logic stopped trusting it; with the sorter down that was the only signal
left. Now `headerSignature || sorted-confirmed`. Three new `pw-schedule-finder`
legs including the arrival check.

**Not a parity defect:** the deployed filter is the calibrated one; 23 candidates
is by design.

**One row per physical unit** — ruled into the extractor's contract. Comma /
ampersand / slash tag lists expand (`B-1,2` → two boilers) carrying the line's
spec values; **ranges are not expanded** (a range states a count without stating
tags, and inventing tags is inventing data). Gate hand-counts are now
physical-unit counts. p16 re-gated: **11/11**, deterministic where it used to
vary between 7 and 11.

**Sort renders at 0.22** — the budget-class law applied to pixels; the sorter is
a classifier, not a reader. Clairlea's payload 2,026 KB → 527 KB with **zero
verdict changes**. Extraction still renders at 2.0. *Limit on record:* the sample
held no scanned schedule, so it proves no false positives, not preserved true
positives.

**A field report describes the SCREEN, not the system** — reconcile against the
ledger before diagnosing the pipeline.

**Correction recorded:** p16's regions are not clipping — the boxes are correct
and the 7-vs-11 difference is multi-unit row expansion (`B-1,2` as one row or
two), which needs a ruling in the extractor's contract rather than a fix.

**New standing rule.** *A gate that runs through a harness proves the harness.*
The gate is the field flow; harnesses are callers of production modules, never
siblings — the one-matcher rule applied to a pipeline.

**Parked:** BACKBURNER 3f, the extraction-rules harvest — the librarian's next
client, waking when a few real sets have been extracted and reviewed.

---

## Update 1.04 — 2026-08-04

### For the team

**Dragging a drawing set in now actually works.** It did not. If you dropped a
PDF, picked the schedule pages and hit extract, **every page failed** — silently
enough that the only way anyone found out was by trying it on a real job and
telling us. That is fixed, and it was our bug, not the drawings'.

**It finds the right pages now.** On a real 55-page tender set it used to offer
you 24 pages; it now offers **4** — and they are the four that actually carry
schedules. The rest are still one click away if you want them; they just are not
pre-ticked any more.

**Big schedule sheets read properly.** A sheet with four schedules on it — wall
fins, forced flow heaters, convectors, eighty-eight units between them — used to
fail outright. The app now finds each table on the sheet and reads them one at a
time.

**Scanned drawings work.** Old sheets with no text layer — the scanned ones on
every retrofit job — go through the picture path and come back with rows.

**Unit Ventilator** joined the equipment library, found by the app reading a real
Clairlea schedule and telling us it did not recognise it.

**One thing to expect:** on a big set you may see *"Sort next 40"*. That is the
cost guard — it reads 40 undecided pages at a time so a 300-page set can never
quietly spend a fortune. Click it again for the next 40.

### Technical record

**The seam, and it is the whole field report.** `api/intake.ts` derived the media
type from `intake_uploads.filename` via `split('.').pop()`. The schedule-page
finder names uploads `"…-IFT.pdf — page 7 (M-301)"`, so that returned
`"pdf — page 7 (m-301)"`, matched nothing, and 400'd — **for every confirmed page,
on every set, from the day the feature shipped**, while a valid PNG sat in
storage that nothing looked at. **R18 — filenames lie — is the firm's own rule,
and our code broke it.** Fixed: `intake_uploads.media_type` recorded at creation
from the object's leading bytes; the endpoint re-sniffs the stored object and its
reading is authoritative; the extension→media map is deleted; refusals now carry
the evidence. Swept for the pattern: one real violation, two benign.

**Diagnosis before fixes, on four real TDSB sets (93 pages).** The taxonomy and
both before/after tables are in
[EXTRACTOR-CALIBRATION-PROPOSAL.md](EXTRACTOR-CALIBRATION-PROPOSAL.md).

**Finder: 47 pages proposed → 9.** Density cannot separate a schedule from a plan
— Clairlea p4 is a *plan* with 142 column runs, p17 a real schedule with 147.
What separates them is a **header row**: an identity column with two or more
descriptive columns beside it, within a short run of text items. Title alone no
longer claims a page either (a TDSB title sheet carries a drawing list; plan
sheets say "as per schedule" in notes). Everything else drops to *ambiguous* and
is offered, not claimed.

**Rotation: fixed and inert, stated plainly.** Column detection now buckets along
the page's true horizontal per `/Rotate`. It changed the measurement on exactly
the 10 rotated pages and flipped zero verdicts, because the threshold was the
binding constraint. Right fix, no effect on this corpus.

**Table-region splitting (2b) — SHIPPED, GATE PASSED.** Clairlea M-601's 88 units read exactly: 32/8/30/18 against the hand counts, 59.3¢, cross-region tag tripwire silent. Two earlier runs are kept in the record because the sequence is the argument — 40 rows truncating, then 136 with 48 phantom, then 88.

**Superseded note:** Region detection is correct
(Clairlea p17 → its four real tables, p16 → its six) and the budget-class fix is
proven, but the gate fails at 136 rows against 88: on a multi-column sheet two
crops read the same column, so it is **not yet safe to trust there**. Details in
[EXTRACTOR-CALIBRATION-PROPOSAL.md](EXTRACTOR-CALIBRATION-PROPOSAL.md).

**Budget classes gained a thinking posture (Law 4).** `extraction` sends
`thinking: { type: 'disabled' }` — reasoning classes buy thinking, extraction
classes buy output, and a class that lets thinking eat the output budget fails on
exactly its densest, highest-value inputs. Measured: 0 thinking tokens against
581 / 1,177 / 5,396 / 4,267 before; both previously-truncating regions now
complete; cost 165.1¢ → 77.7¢.

**Original 2b note.** Clairlea M-601 carries 88 units in four tables;
sent whole it logged `outcome: truncated` at 16,000 output tokens having spent
**10,684 thinking**, and cost 27¢ for nothing. Row ceilings were rejected — a
mechanism that fails on the highest-value page is backwards. The **first attempt
also failed and is recorded**: spatial gap-clustering fragmented that page into
318 pieces. What works is segmenting on header rows **in reading order**, because
these PDFs emit text table by table. A page with one table returns no regions and
is read whole.

**Sort ceiling: chunked continuation, not a raise.** The 40-page guard and its
cost visibility stay; the dead-end refusal becomes *"Sort next 40"*.

**`unit_ventilator` minted** — surfaced by the extractor reading Clairlea p16
correctly and returning it unresolved at 0.55. The learning loop end to end: real
page → honest abstention → propose flow → ratified mint.

**Fixture library (Phase 3).** `samples/calibration/FIXTURES.md` is committed;
the drawings are not and never will be. The manifest records what each fixture
contains, what each page exercises, and **what the corpus does not contain** —
no scanned page carrying a schedule, no two-page continuation, no non-TDSB
consultant — so absence is never mistaken for coverage. Suites skip loudly by
name.

**New standing rule.** *A test boundary chosen for safety creates a known-untested
seam — name it.* The finder's render-and-look gate stopped at the confirm screen
deliberately and correctly; that is exactly where the break was. Every gate report
now names the legs it did not walk.

**ShareSync: zero writes**, verified by a pre/post integrity sweep over sizes,
mtimes and sha256 of every file in all three folders — identical.

---

## Update 1.03 — 2026-08-03

### For the team

**Typing equipment now suggests as you go.** Start typing in the Equipment Type
box: `UH` finds Unit Heater, `FCU` finds Fan Coil Unit, `BLR` finds Boiler, `XFMR`
finds Transformer. Pick it and the unit is typed on the spot — nameplate fields
appear immediately. The suggestion tells you *why* it matched, so you never have
to wonder whether it guessed.

**If nothing matches, you're still not stuck.** The last row in the list offers
*"No matching type — propose '⟨what you typed⟩'"*. Choosing it **saves the unit**
with the name you wrote and sends the name to Tony for the firm library. Once it's
approved, every matching unit picks it up. Same box in the Cx Index add form, the
equipment editor, and the intake review screen.

**The app drafts nameplate tables now.** When a new equipment type is added, it
proposes the fields — field, unit, imperial unit, and which of the three columns
each belongs in — for Tony to edit and approve. Nothing is saved until he does.

**Drop a whole drawing set into equipment intake.** Instead of finding the
schedule pages and exporting them yourself, drag the whole PDF in. It reads the
pages, shows you the ones that look like schedules — sheet number, title, and a
thumbnail — and **only the pages you tick get read**. Your existing habit still
works and is still fastest when you already know the page numbers.

**The equipment library went from 19 types to 47.** It now covers the whole
commissioning world you actually work in, not just the mechanical core:

- **Mechanical** — rooftop units, make-up air, HRV, VRF, dehumidifiers, duct
  heaters, heat exchangers, air separators
- **Electrical** — transformers, switchgear, switchboards, motor control centres,
  lighting panels, VFDs, UPS
- **Plumbing** — domestic hot water heaters, water softeners, backflow
  preventers, air compressors, sump pumps
- **Fire and life safety** — fire pumps, jockey pumps, fire alarm panels, fire
  smoke dampers, and the smoke-control side: smoke control fans and the
  firefighters' smoke control station
- **Conveying and envelope** — elevators, louvers

**Every one of those 47 types has proper nameplate fields**, built against the
standard that governs it — NETA for the electrical gear, NFPA 20/25 for the fire
pumps, CSA B64 for backflow preventers, AHRI for the air-side equipment, ASME
markings on the vessels, ASME A17.1/CSA B44 for elevators. Not a generic list:
what an acceptance record is actually expected to hold.

**Shorthand is yours to edit.** Classifications → Equipment Types has an Aliases
column. Add the shorthand your projects actually use and it works everywhere
immediately.

**A fixed crash:** the Classifications screen had been going blank on open. It's
back — that's where proposed types are approved.

**One habit, unchanged and worth repeating:** when a project has a mechanical
schedule, don't type equipment by hand. Extract the schedule pages and drag them
into equipment intake — or now, drag the whole set and let it find them.

### Technical record

**The 1.02 trio** (shipped this arc, folded here): the suggestion-as-you-type
picker on three surfaces with the shared `resolveType` gaining an exact-only
alias tier; AI-drafted starter field sets via the `drafter` agent; and the
schedule-page finder — deterministic text-layer filter in the browser, the
`sorter` agent only on what the filter cannot call, the extractor only on what a
human ticks.

**The catalog campaign: 19 → 47 types.** Researched against CSA Z320, ANSI/NETA
ATS, OmniClass/UniFormat and the ASTM E2813/E2947 BECx framework rather than
free-associated. Six mints came from *demand evidence* — untyped units already
sitting on live projects (18 Transformers, 7 Lighting Panels, 7 Heat Exchangers,
2 Switchboards, 2 Electric DHW Tanks). All minted **base-only**; every table
arrived afterwards through ratification.

**The census matcher fix.** The retroactive re-check proposed 7 moves and **four
were wrong**: `Pump - Boiler 1` and `Heating Boiler B-2 Circulating Pump`
resolved to `boiler`. Both are pumps. `pump` and `boiler` are each one token, both
matched, and the tie-break was `tokens.length > best.specificity` — *strictly
greater* — so the first type in **sort order** silently won. The sort order was
deciding the type, on a live project. Fixed: equal-specificity matches on
different keys **return null** — the words name two types, so the words do not
decide and a human does. A more specific term still wins outright. One test
asserts **sort order cannot change the answer** by running the same descriptor
against a reversed vocabulary. Census after the fix: 3 moves, all correct,
batch-tagged, read back.

**Ratification binds to an ARTIFACT — recorded as a law.** The batch runner's
`--apply` flag re-ran the drafter and wrote whatever came back; the model is not
deterministic, so **a field was applied that was never ratified**. 185 def rows
and 10 ledger rows written un-ratified, reversed by insertion timestamp. The law
now reads: *what is applied is the stored, reviewed content — byte-identical to
what the human read; draft tools cannot write, apply tools cannot draft, and the
applier refuses when the target has moved since ratification.* Mechanism:
`proposals/batch-N-ratified.json` + `apply-ratified.mjs`, which makes no model
call, refuses on a moved target, and reads back every field it claims to write.

**Every ratification surface audited against it**, rather than assumed: drafter
(fixed), librarian (complies — inserts `status='proposed'` and says so), mint
queue (complies), classifier rule ratification (complies), classifier *exception*
ratification (**partial** — re-queries equipment at apply time; deterministic, so
not this law's failure, but no moved-target check. On BACKBURNER with the fix
named).

**Four drafting batches, standards-anchored, delivered for ratification.** 45
tables, 993 def rows written this arc, ledger fed per type with the anchor as
evidence. The discipline held in the direction that is hard to get: the drafter
argued *against* additions on the types with the most live units (*"a fin and a
casing don't need much more"*), separated standard from convention unprompted,
declined to draft medical-air fields under a standard it was not given, and
refused per-tap turns ratio as *"a table within the nameplate"* — which was
correct and became BACKBURNER 3d.

**The IST addendum.** Anchored on CAN/ULC-S1001, whose scope decides most of the
question: it verifies the **interconnections** between two or more fire
protection and life safety systems and **explicitly not those systems
themselves**. Two mints — `smoke_control_fan` (clearing the RTU-vs-AHU bar on a
different standard, power source, test and consequence of failure, with a
`Smoke Control Duty` discriminator inside it) and `smoke_control_panel`.
Everything else argued *not* to be a type with the reasoning recorded: door
holders, mag locks, elevator recall (scope on `elevator`), load-bank connections
(a field on `generator`), and sprinkler supervisory devices (**points on a
system**).

**The applicability exception, with its edge as a condition of adopting it:**
*IST-minted types only, the fire-integration stage group only, ruled in the same
sitting as the mint.* Written down because the argument generalises badly, and
because **a wrong ruled rule is silently wrong on every future project while a
wrong proposal is read once and rejected.**

**Variants are DATA** — types are equipment classes, variants are values, and
splitting is a mint ruling at the RTU-vs-AHU bar, never a drafter decision.
Precedents both ways: `booster_pump` and `unit_heater_gas` declined;
`fire_pump`/`jockey_pump`/`sump_pump` minted.

**Coverage closed.** All 47 types carry a nameplate table — **zero without**.
Four sit below the 10-field bar with their arguments recorded rather than padded:
`convector` and `wall_fin` at 8 (passive emitters, restraint endorsed),
`jockey_pump` at 8 (the amendment's own arithmetic), `ats` at 10 (standing).

**Parked this arc** — [BACKBURNER](BACKBURNER.md): portal endpoint consolidation
(frees 3 of Vercel's 12 function slots; never as a side effect of a feature),
repeating-measurement test structures (per-tap TTR as founding case, with NETA,
BECx and NFPA 25 siblings), and the IST module (scenario matrix, deficiencies
filing into the existing findings register, waking at the first scheduled IST).

**Harness:** `pw-type-picker` 20 · `pw-drafter` 10 bare / 18 with `--real-ai` ·
`pw-schedule-finder` 13 bare / 17 with `--real-ai`. Battery 31/31.

---

## Update 1.02 — 2026-08-03

*All three items shipped. Folded into 1.03's team note; kept here as the as-built record of the trio itself.*

### For the team

**Typing a piece of equipment now takes three letters.** Start typing in the
Equipment Type box and it suggests as you go: `UH` finds Unit Heater, `FCU` finds
Fan Coil Unit, `BLR` finds Boiler, `XT` finds Expansion Tank. Pick it and the
unit is typed on the spot — nameplate fields and checklist applicability appear
immediately, no save-and-reload.

**The suggestion tells you why it matched.** Under "Unit Heater" you'll see
*matched "UH"*. You never have to wonder whether it guessed.

**Unknown equipment still never stops you.** If nothing matches, the last row in
the list offers *"No matching type — propose '⟨what you typed⟩'"*. Choosing it
**saves the unit** with the name you wrote and sends the name to Tony for the
firm library. The unit is never blocked, and once the type is approved every
matching unit picks it up.

**Same box in all three places** — the Cx Index add form, the equipment editor,
and the equipment intake review screen. One behaviour to learn, not three.

**Shorthand is editable, not baked in.** Classifications → Equipment Types now
has an Aliases column. Add the shorthand your projects actually use and it works
everywhere immediately.

**New types can draft their own nameplate table.** Mint a type in
Classifications and, while it has no fields yet, a **draft fields** link appears
beside it. It proposes a table — field, unit, imperial unit, and which of the
three columns each belongs in — and you edit it, cut rows, and approve. **Nothing
is saved until you approve**, and minting with identity fields only is still a
perfectly good outcome.

It is deliberately conservative: for a convector it proposed ten fields and said
in its note that it left out control-valve details because those usually belong
to a valve record rather than the convector nameplate — and asked you to flag it
if the firm's convention differs.

**You can drop a whole drawing set into equipment intake now.** Instead of
opening the PDF, finding the schedule pages and exporting them yourself, drag the
whole set in. It reads the pages, shows you the ones that look like schedules —
sheet number, title, and a thumbnail of each — and **only the pages you tick are
read**. Each ticked page is one extraction, and it says so before you spend it.

Pages it is sure about arrive ticked; pages it is only offering arrive unticked,
so a glance is enough. If it can't read a page at all it still shows it rather
than dropping it.

**Your existing habit still works and is still the fastest** when you already
know the page numbers: export those pages and drag them in. Nothing about that
path changed.

**A fixed crash:** the Classifications screen had been going blank on open. It's
back — that's where proposed types are approved.

### Technical record

**Alias tier on the shared matcher.** `resolveType` gains
`resolveTypeDetailed`, which resolves in three tiers — canonical name/key →
**exact alias** → all-words most-specific-wins — and reports which tier hit so
the UI can show `matched "UH"`. `resolveType` is now a thin wrapper: still
exactly one matcher, still shared with the intake path.

**Aliases match exactly and never as words.** `UH` → Unit Heater; `UH-3 PUMP
ROOM` → nothing. Ranking for *display* is deliberately looser than matching —
loosening the ranker cannot type a unit, loosening the matcher could type a
hundred.

**`equipment_type_aliases`** — vocabulary data, admin-edited beside the types,
`unique(lower(btrim(alias)))`. Seeded with 31 ruled entries including DOAS→ahu
and BLR→boiler.

**`blocked_type_aliases` + BEFORE INSERT trigger.** The never-alias list with the
reason attached: `rp` (the RADIANT/RECEPTACLE collision), `ct` (current
transformer), `ch`/`p`/`wf` (tag-prefix collisions), and `rtu`/`hrv`/`vrf` —
ruled **distinct equipment**, which arrive through the propose flow. Enforced at
the database, not in the UI.

**The never-blocked save.** `equipment.observed_type_name` (new column) plus a
deduped `proposed_equipment_types` entry; the waiting-unit count is **derived,
never stored**. `api/intake.ts` now carries the observed name onto created units
so an approved unknown row and its later ratification can find each other.

**Three self-catches, all instances of rules already in ARCHITECTURE:**

1. The queue dedup index was a **no-op** — `org_id` is NULL on every row and a
   plain unique index treats NULLs as distinct, so both duplicate inserts
   succeeded while the index existed and read correctly. Fixed with `NULLS NOT
   DISTINCT`; caught because the pw leg asserts the second insert is **refused**
   rather than asserting the index is present.
2. `pw-type-picker`'s surface-1 check was `check(true, …)` after a bounded wait —
   passing while the wait timed out. A check that answers the same in both
   states, written the same evening as the rule against them.
3. **The Classifications page had been crashing to a blank screen since
   2026-07-27** — `useState`/`useEffect` below an `if (loading) return`, a
   hooks-order violation. Every structural assertion stayed green because the
   data behind the screen was correct. Found by taking a screenshot.

**The drafter — a seventh agent.** `firm-knowledge/agents/drafter.md`,
`budget_class: prose` with the reasoning stated in the contract itself (the
classifier's zero-text incident is why a bounded question does not get a
`reasoning` budget). Measured after, per the ruling; the class moves narrower
before wider.

**Law 9 at the shape.** `FieldSetDraftInput` requires a non-empty
`base_field_names` — the contract forbids duplicating the universal identity set,
so that set is a required input rather than something the model must know. Base
collisions are also dropped at the endpoint: a rule living only in prose is one
the next model version may not follow.

**No 13th serverless function.** `api/` is at Vercel's ceiling of 12, so the
drafter routes through `api/intake.ts?action=draft-field-set`. Refusals before
any spend: not staff · unknown type · **a type that already has a table** (409,
count named). The portal-endpoint consolidation that would free three slots is
parked with its own gates.

**Two more self-catches on the first real call:** the contract had **no Return
shape section**, so the model was never told the JSON — every call failed
`contract-output`. And `pw-drafter` asserted field properties with `.every()`,
which passes vacuously on an empty array: four checks went green on zero fields
when the draft failed. Arrival is proven first now.

**The schedule-page finder — three costs, cheapest first.** The deterministic
text-layer filter runs in the **browser** (free, every page); the new `sorter`
agent sees only what the filter could not call (~1–2¢/page); the extractor sees
only what a human ticked. `sorter` takes `slices: [terminology]` alone — identity
and style cannot change whether a page is a table.

A failed sort **fails open into the human's hands**: pages come back undecided to
the confirmation screen, never dropped and never guessed in. The page ceiling
refuses with the alternative named rather than truncating quietly. One upload per
confirmed page, because the extraction budget is per page — so a set where page
44 fails still yields 41 and 42, and failures are named rather than counted.
`intake_rows.source_sheet` / `source_page` already existed and are now populated;
`intake_uploads.selected_pages` is the only schema delta.

**Render-and-look caught a real behavioural defect.** Run against a completed
*checklist* PDF, two of its three pages arrived **pre-ticked** — a checklist is
also a dense tagged table with MODEL and MANUFACTURER headings and scored "8
schedule terms in 30 columns". Being offered is cheap; being ticked by default is
a claim. Only a page **titled** a schedule, or one the sorter confirmed, is
pre-ticked now. The candidate grid also overflowed its panel; bounded and
scrolling.

`pw-type-picker.mjs` — 20 legs. `pw-drafter.mjs` — 10 bare, 18 with `--real-ai`.
`pw-schedule-finder.mjs` — 13 bare, 17 with `--real-ai` (the real sort called the
pump schedule a schedule and refused the **door** schedule as "a real schedule,
wrong discipline"). All three in the battery; the two agent suites run bare
there, like the extractor, because a battery that bills on every commit gets run
less often. Wait helpers from birth. **Battery 30/30.**

**Named gap, not covered by any suite:** the deterministic filter's accuracy on a
real multi-page drawing set. There is no ZZ-TEST fixture set, and a synthetic PDF
would test the synthesiser. That leg is a manual render-and-look, and the suite
header says so rather than letting its absence read as coverage.

---

## Update 1.01 — 2026-08-02

### For the team

**Adding contacts from a project's Team tab now captures everything.** Before, it
only saved a name — no phone or email, invisible to distribution lists. Now it
opens the full contact form (the same one the Directory uses) with the company
pre-filled. People are complete from the start. *(Adam's suggestion.)*

**Click any team member's name** to jump to their full contact card.

**Distribution lists: "Add from team"** pulls the whole project team in with one
click.

**Equipment can be copied.** Ten identical pumps: enter one, copy, change the tag.
Specs copy; serial numbers and verification work never do — those belong to each
physical machine.

**Equipment can be deleted — safely.** Mistaken units delete cleanly; units with
linked findings are blocked, and the app shows exactly which findings.

**Unknown equipment doesn't stall you.** Add it anyway — it saves immediately with
manufacturer/model/serial, the name goes to Tony for the firm library, and once
approved, every matching unit updates automatically on every project. *(Clairlea
went from 93% blank nameplates to nearly all working this way.)*

**Every unit now shows Manufacturer, Model, Serial** — even untyped. Boilers
gained fluid type, pumps a VFD yes/no, unit heaters MBH. *(Adam's and Mahan's
requests.)*

**Small fixes:** the second-email save error is fixed · dashboard text overlap
fixed · location fields suggest the project's existing spellings · units (L/s,
GPM) now show beside the input box.

**One habit:** when a project has a mechanical schedule, don't type equipment by
hand — extract the schedule pages from the PDF and drag them into equipment
intake. The app reads them, proposes the list, you review and accept. **Pages, not
screenshots** — keep the text layer.

*Everything above except two items came directly from team feedback — keep it
coming.*

### Technical record

**Contacts.** Shared `ContactModal` extracted; Directory and the Team tab now sit
on one save path via `replace_contact_channels` — the four-request silent-failure
path is retired. Team-name click-through to the Directory contact.
Contact primary-constraint write-order fix.

**Distribution.** Add-from-team on project distributions (copy, not sync).

**Equipment.** Copy-equipment (template only — never serial or verification state,
tag cleared). Reference-aware delete: findings **named**, not counted.
Location Combobox suggestions. Unit-beside-input.

**Nameplates.** `__base` universal identity set, applied by resolver-prepend so
untyped units record identity too. Campaign seeded: `panel` / `humidifier` /
`radiant_panel` / `unit_heater` tables; `boiler` +Fluid Type, `pump` +VFD,
`fan` +MBH; `heat_pump` trimmed 25 → 14.

**Type vocabulary as a learning system.** Four mints this cycle — `unit_heater`,
`wall_fin`, `convector`, `expansion_tank` — with name variants *mapped* rather
than minted separately. 118 units retroactively typed and def-backfilled,
batch-tagged.

**Dashboard.** Radar axis and clipping fixes.

**Harness.** Read-after-write sweep: bounded waits, absence-assertions-prove-
arrival-first; ~150 remaining reads governed by the touch-policy rather than a
backlog.

**ARCHITECTURE.** Six rules added this cycle, each with its incident evidence.
