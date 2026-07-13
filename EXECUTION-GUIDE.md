# EXECUTION-GUIDE.md — Getting everything into the app and executing it
Read this once, follow it top to bottom, then delete it (it's a runbook, not a doc).

---

## Step 1 — Place the files in the repo (`C:\Dev\isotherm-cx`)

```
C:\Dev\isotherm-cx\
├── ARCHITECTURE.md                          (existing — will be patched in Step 3)
├── Isotherm_Cx_System_Build_Spec.md         (existing — will be patched in Step 3)
├── BAS-INTEGRATION-PATCHES.md               (NEW — temporary, deleted after Step 3)
├── docs\
│   ├── MASTER-BRIEF.md                      (NEW — the canonical roadmap)
│   ├── PHASE-MAP.md                         (NEW — phase-numbering translation)
│   └── BAS-SPEC.md                          (NEW — v1.2, Master Phase 6 spec)
└── fixtures\bas\                            (created later, during Phase 6 step 2)
```

Notes:
- Create `docs\` if it doesn't exist. If your Build Spec currently lives in the repo
  root, either leave it there or move it into `docs\` — pick one and be consistent.
  ARCHITECTURE.md stays in root by convention.
- The old `Master_Implementation_Brief_for_Claude.pdf` is superseded by
  `docs/MASTER-BRIEF.md`. Don't put the PDF in the repo; archive it wherever you keep
  planning history.
- Do NOT commit raw TDSB shop drawings or trend exports to the repo — the submittals
  contain credentials and network details. Fixtures get sanitized copies later, and
  the repo should get a `.gitignore` entry for any raw-drop folder you use locally.

Commit:
```
git checkout -b docs/master-roadmap
git add docs/ BAS-INTEGRATION-PATCHES.md
git commit -m "docs: master roadmap v2, phase map, BAS spec v1.2, integration patches"
```

## Step 2 — Sanity read (you, 10 minutes)

Skim `docs/MASTER-BRIEF.md` §5 (roadmap) and §6 (parallel tracks). If you disagree with
the Phase 6/7 swap or rule 17 (org_id), change it NOW — after Claude Code starts
building, the docs are load-bearing.

## Step 3 — Claude Code, prompt 1 (apply patches — small, verifiable)

```
Read BAS-INTEGRATION-PATCHES.md and apply Patches 1 and 2 to
Isotherm_Cx_System_Build_Spec.md and ARCHITECTURE.md exactly as written.
Patch 3 is already applied — verify docs/BAS-SPEC.md matches it, don't re-apply.
Show me the full diffs before writing anything. After I approve, write the changes,
delete BAS-INTEGRATION-PATCHES.md, and commit with message
"docs: integrate master roadmap and BAS spec (patches v2)".
```

Verify the diffs yourself. This prompt is deliberately tiny — it forces Claude Code to
read both existing docs before ever touching code.

## Step 4 — Claude Code, prompt 2 (Phase 2 pre-flight — NO migration yet)

```
Read docs/MASTER-BRIEF.md fully. Current build is Master Phase 2 (Checklist Engine).
Do the §10 pre-flight ONLY — no migration, no code:
1. Propose the full DDL for the 14 checklist tables, including cross-instance
   integrity constraints (composite FKs or equivalent) per MASTER-BRIEF Phase 2.
2. Every table gets org_id per rule 17.
3. Show the snapshot strategy for instances and completed-checklist nameplate data.
4. Show finding-link duplicate prevention (unique constraint on failed
   item/target combination).
5. Show the RLS policies for template layer (admin/developer write) and
   instance/response layers (project membership).
6. Confirm the design supports the full issue-origins list and evidence snapshots
   (rules 16, §7) without changes later.
Output everything as a review document. Wait for my approval.
```

Review it against MASTER-BRIEF §5 Phase 2 and the non-negotiables. This is where you
catch design errors cheaply.

## Step 5 — Claude Code, prompt 3 (execute Phase 2, stepwise)

```
Pre-flight approved. Execute the Phase 2 build sequence from MASTER-BRIEF §10 one step
at a time, stopping for my review after each:
1. Write and run the migration; update src/types/database.ts.
2. Update ARCHITECTURE.md schema section per the new tables.
3. Template Library UI (admin/developer only).
4. Template Builder (sections, items, grids, signoffs). One minimal dev/test
   template only — do not seed real Isotherm forms yet.
5. Project checklist instance creation (with snapshot on create).
6. Checklist fill-out UI — acceptance criteria include field resilience:
   autosave per response, offline/reconnect without data loss, phone photo capture.
7. Failed-item-to-finding modal with duplicate prevention and linked-finding badges.
8. Playwright tests for the full flow + the field-resilience cases.
```

Migration safety: have Claude Code run it against a Supabase branch or your dev
project first if you have one; otherwise take a backup (Dashboard → Database →
Backups) before step 1.

## Step 6 — Parallel tracks (you, not Claude Code — start this week)

**Track A — manual wedge validation.** Pick one real project with trend exports +
sequence of operation. In a Claude chat (this project works — the CSVs are already
here), run a manual trend review and produce the MASTER-BRIEF §9 deliverable:
equipment reviewed, points reviewed, trend period, failed/suspicious conditions,
suspected causes, contractor action list, report-ready deficiency wording. Show it to
Peiman; ideally attach it to a real project deliverable. Pass = 5–10 useful findings.
This validates the Phase 6 business before you build the Phase 6 software.

**Track B — TDSB access.** Draft the read-only access request (the "ideal client
request" wording is in MASTER-BRIEF §5 Phase 9 context and the deep-research report's
contract clauses). Route through Peiman under an active TDSB project. Months of lead
time; zero engineering dependency.

## Step 7 — What comes after Phase 2

Phase 3 (report/closeout automation) → Phase 4 (low-risk AI drafting) → Phase 6
(BAS-SPEC build order §11: migration → Delta adapter with real-file fixtures → upload/
review/commit flow → mapping workbench → submittal extractor → LLM pass → charts →
BAS-2). When starting Phase 6, hand Claude Code `docs/BAS-SPEC.md` steps 1–2 only and
review parser output against the real files before any UI work. Note Phase 5 can be
deferred or folded into Phase 6's submittal extractor — decide then, not now.

## Common failure modes to watch for

- Claude Code inventing its own phase numbers → point it at docs/PHASE-MAP.md.
- Migration written without cross-instance constraints → reject; it's non-negotiable.
- Checklist UI that saves per-form instead of per-response → fails field resilience.
- Anything writing to BAS tables before Phase 2 is done → out of order; stop it.
- Real Isotherm checklist forms seeded before the flow works → premature; one dev
  template only until step 8 of the pre-flight sequence passes.
