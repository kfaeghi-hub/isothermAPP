# PRODUCT.md — Isotherm Cx System

Product truth for design work (impeccable). Facts sourced from docs/MASTER-BRIEF.md
(canonical), Isotherm_Cx_System_Build_Spec.md, and the live production system.

## What it is

Production internal commissioning-management system for Isotherm Engineering Ltd.
(Toronto-area building commissioning consultancy). Replaces Word/Excel workflows for
running Cx projects end-to-end: projects, findings (Issues Log), checklists
(IVC/PFC/FPT), site reports, meetings, deliverables, equipment registers, document
generation (branded PDF/DOCX), and a portfolio dashboard. Roadmap: AI commissioning
intelligence over BAS data — always read-only, human-approved, evidence-backed.

## Who uses it

Three-to-six Isotherm engineers (owners Tony and Peiman Faeghi, senior staff), daily.
Two scenes: office review on large monitors (reports, dashboards, meeting prep) and
field use on phones/tablets inside mechanical rooms — poor light, gloves, haste.
Clients (TDSB and other public-sector owners) receive generated documents today; a
client portal is future phase. No public marketing surface in-app; the login page is
the only pre-auth screen.

## The mechanism

The Issues Log is the backbone: everything that discovers a problem — checklists,
site reports, reviews, future AI trend analysis — creates or links to an Issue, and
every report and follow-up pulls from it. Completed records are frozen history
(rule 4); reports are generated from structured data, never hand-assembled.

## What the interface must be

- **Operate-first**: fast scanning, fast data entry, dense but legible registers
  (findings, checklists, equipment, deliverables). Expression never obscures task.
- **Trustworthy record**: this system's outputs carry the firm's professional
  identity to clients; the UI must read like an engineering instrument, not a toy.
- **Field-resilient**: phone-usable in the field (MASTER-BRIEF Phase 2 requirement);
  navigation must collapse on small screens.
- **Status semantics everywhere**: open/closed findings, checklist Y/N/NR/NA,
  deliverable lifecycle, overdue attention — color carries meaning and must stay
  distinguishable and accessible.

## Brand facts

Firm: Isotherm Engineering Ltd. — the name is the thermodynamic term (lines of equal
temperature). Existing marks: "Cx System" wordmark with teal accent on the "Cx".
Generated documents use the firm's navy/teal print identity (FIRM header block in
api/generate-checklist.ts). No formal brand guide exists; the app IS the brand
surface. Domain vocabulary: CSA/ASHRAE/LEED commissioning practice, sealed drawings,
BAS operator graphics, TAB instruments, equipment tags.

## Constraints

React 19 + TypeScript strict + Tailwind v4 (Vite SPA), Supabase, Vercel. Playwright
suites assert on roles/labels/data-testids — visual overhaul must preserve semantics
and text labels. ZZ-TEST-only rule for automated tests. Accessibility matters
(public-sector clients). No paid assets; fonts must be freely licensable.
