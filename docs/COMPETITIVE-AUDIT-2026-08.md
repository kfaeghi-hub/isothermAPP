# Competitive audit — Cx software market

**Competitive Feature Audit: Commissioning (Cx) Management Software —
Benchmarking "Isotherm Cx" Against the Market.** Prepared for the co-owner of
Isotherm Engineering Ltd. (Richmond Hill, Ontario).

**As of: 5 August 2026.** Vendor pages treated as authoritative over third-party
aggregators. Recorded in the repo 2026-08-05.

> **This is a snapshot, and snapshots rot.** Pricing, packaging and feature sets
> in this market drift continuously — vendors reposition, tiers get renamed,
> features move between plans. Every claim below is *as observed on the date
> above* and should be re-verified before it informs a decision that matters.
> Several figures are aggregator estimates rather than vendor-published; those are
> flagged in **Caveats**, which is the most important section for anyone acting on
> this document.

---

## TL;DR

- **CxPlanner is the most direct AI-forward competitor to Isotherm Cx**, but its
  AI is concentrated in checklist generation, P&ID tag extraction, nameplate
  photo recognition, and data-compiled reporting. Its claims of true AI *narrative*
  drafting of Cx Plans and AI extraction from *mechanical schedule tables* are
  marketing assertions not documented in its help center — meaning Isotherm's
  schedule-extraction and AI-drafted-Cx-Plan-with-ratification workflow are likely
  genuinely ahead of the field.
- **The market splits into three tiers:** purpose-built Cx incumbents (CxAlloy,
  Facility Grid, Bluerithm, CxPlanner) at roughly **$65–$135/user/month** (except
  CxAlloy's unlimited-user model from ~$355/month); adjacent construction/punch-list
  tools (Fieldwire, PlanRadar, Procore) that lack true Cx test/equipment structure;
  and MBCx/analytics tools Isotherm does not compete with. **Every serious incumbent
  shipped AI features in 2024–2026**, so AI alone is no longer unique — differentiation
  is now depth, human-approval architecture, and schedule/drawing ingestion.
- **Isotherm's biggest build-vs-buy risk is not features but enterprise plumbing:**
  SOC 2/ISO 27001 attestations, SSO, API/webhooks, BIM/IFC integration, and
  multi-language — areas where funded competitors (Facility Grid, backed by Nexa
  Equity; CxAlloy, which holds ISO 27001 certification and SOC 2 attestation) are
  investing. Isotherm should position its platform as a differentiated CxA-side tool
  and decide deliberately whether to commercialize.

---

## Key findings

**1. CxPlanner (primary target) is a Danish, founder-led, recently-funded
challenger brand explicitly targeting CxAlloy/Bluerithm/Facility Grid.** Owned by
Commissioning ApS / CxPlanner ApS (Copenhagen, Denmark; TAX DK40753702), founded
by Thomas Toftgaard Jarløv — an electrician-turned-commissioning-expert who
co-authored the Danish commissioning standard and built Copenhagen Airport's Cx
department. Per RocketReach's org chart it "employs 13 employees," and its own
Compounding Capital press release describes a lean team with a growth rate
exceeding 200% annually, serving hundreds of clients across 20 countries. Its
homepage openly states it is "Built for Cx-teams who are frustrated with CxAlloy,
Bluerithm, Facility Grid and Excel."

**2. CxPlanner's feature set is broad and genuinely commissioning-native**,
covering: System & Test view (equipment/test hierarchy), checklists for
PFC/FPT/Cx and QA/QC, punch-list/issue management, issue markup on drawings,
planning & scheduling (with MS Project schedule import and baselines),
dashboards/analytics, a Template Center, a 3D model viewer, an Asset module,
inline TAB/NEBB spreadsheets with automatic calculations, and a reporting module
that builds ASHRAE Guideline 0 / Standard 202 / LEED-aligned reports. It has
iOS/Android/macOS apps with offline access, photo capture, and real-time sync. It
complies with ASHRAE Guideline 0, ASHRAE Standard 202, and Danish DS3090.

**3. CxPlanner's "CxAI" is the deepest marketed AI story among the incumbents**,
spanning: an AI checklist/test-script generator (shipped 2022, branded CxAI Jan
2025), P&ID tag extraction, nameplate/photo recognition into asset data,
spec-document Q&A ("ask your specs"), file-change insights, automated real-time
reporting, a natural-language assistant ("what should I focus on this week?"), an
MCP integration to connect ChatGPT/Claude, and marketing claims of "agent-native"
multi-step autonomous agents. **Crucially, its *verified* capabilities are
checklist generation, tag/photo extraction, and *data-compiled* reporting; its
claims of AI *drafting the Cx Plan document* and AI populating asset lists from
O&M manuals appear only in aspirational marketing copy** ("Imagine deploying an
agent…", "generates the draft for you") **and are not corroborated in its help
center.**

**4. CxPlanner does NOT offer a true account-free public view-only share link** —
external stakeholders are added as invited "Viewer" users tied to a business email
and an account; reports are shared as PDF snapshots or emailed. This means
Isotherm's external view-only share links are a genuine differentiator versus
CxPlanner.

**5. CxPlanner claims only GDPR compliance** (with an EU-hosted, ISO 27001-certified
data-center *provider*), and does **not** claim its own SOC 2 or ISO 27001. This
contrasts with CxAlloy, whose homepage states: "With our ISO 27001 certification,
SOC 2 attestation, encrypted data, and single sign-on (SSO) enhancements, you can
be confident your data is secure."

**6. All four Cx incumbents shipped AI in 2024–2026:** CxPlanner (CxAI suite),
Bluerithm (Bluerithm 2.0, released May 21, 2026 — AI checklist/form generator, AI
user import, MCP server, Claude Cowork agentic integration, 9-language
localization), CxAlloy (Milestones tracking + camera label-scanning; no
generative-AI drafting found), and Facility Grid (expanded Operational Readiness
platform, Jan 2025). **Bluerithm's "designed to support commissioning
professionals, not replace their expertise," with "humans in control for review,
validation, and decision-making," is the closest competitor framing to Isotherm's
agent-with-approval-gates concept.**

---

## Details

### CxPlanner — full audit

- **Company/background:** CxPlanner ApS / Commissioning ApS, Copenhagen, Denmark.
  Founder/CEO Thomas T. Jarløv (CxAP, CxM, QCxP; first in EU to hold both CxM and
  CxAP). 13 employees (RocketReach). Per CxPlanner's own press release, it "has
  announced a strategic investment from Compounding Capital… led by its founder
  Kasper Grundtvig Knokgaard," whose background includes EQT Partners and McKinsey
  (amount undisclosed), to fuel U.S. expansion. Target markets: construction
  projects, data centers/hyperscale, oil & gas/renewables, industrial/mechanical
  manufacturers. Positioned to CxA/provider-side plus completion-management
  ("CCMS") and operational-readiness use cases.
- **Pricing** (cxplanner.com/pricing, corroborated by resellers): **Cx Professional
  ~$65–95/user/month** (max ~5 users, 3 projects; includes AI test generator,
  professional reporting); **Business from $430–640/month company price**
  (unlimited users, custom fields, company logo on reports, custom reporting,
  1,000+ tests/assets, Company Template Center, free onboarding); **Enterprise
  custom** (adds SAML SSO, API access, advanced user management, custom security
  policy, dedicated hosting, dedicated CSM). Third-party aggregators conflict
  (SoftwareSuggest cites ~$430/month start; ITQlick estimates ~$49/user single
  user; Software Finder lists $95/user Pro) — **treat cxplanner.com as
  authoritative**; figures are 2025–2026.
- **Modules/features:** System & Test view; checklists (PFC/FPT/Cx, QA/QC); punch
  list & issue management; issue markup on drawings (with GPS-coordinate location
  when drawings absent); planning & scheduling (MS Project import, baselines,
  timeline); dashboards & analytics (Power BI connector); Template Center; 3D model
  viewer; Asset module; inline TAB/NEBB spreadsheets with auto-calculation;
  reporting module (QA/progress and formal final reports per ASHRAE G0/Std
  202/LEED); audit-log traceability.
- **AI (CxAI):** checklist/test-script generator; P&ID tag extraction (filter tags
  by system/subsystem); photo/nameplate recognition into asset data; "ask your
  specs" document Q&A; file-change insights; automated real-time reporting; NL
  assistant ("smart priorities"); MCP integration (ChatGPT/Claude); "agent-native"
  claims. CxPlanner states CxAI uses "closed-loop LLM models… hosted entirely within
  CxPlanner's own infrastructure," with client data isolation and no training on
  client data.
- **Mobile/offline:** iOS/Android + macOS (M1+); offline access; real-time
  cross-device sync; photo capture (JPEG/JPG/HEIC/PNG).
- **Integrations:** Procore, Autodesk Construction Cloud (Partner Card in Autodesk
  Build Insight / BIM 360 Project Home dashboards, since June 2023), Microsoft
  Power BI, Zapier; company-level API keys (Enterprise). 3D model viewer present
  but no evidence of native IFC/BIM authoring — a viewer/integration layer only.
- **Languages:** English, Danish, Spanish, Dutch, German (5).
- **External sharing:** No account-free public link; external parties invited as
  "Viewer" users; reports exported as PDF or emailed.
- **Compliance:** GDPR only (EU-hosted; the data-center *provider* holds ISO
  27001); no own SOC 2/ISO 27001.
- **Strengths:** fast/practical UI, deepest AI marketing story, commissioning-native
  depth, standards alignment, completion-management scale (10,000+ tests/assets),
  founder credibility. **Weaknesses:** thin third-party review presence
  (G2/Capterra profiles largely unreviewed), no true public share link, no own SOC
  2/ISO 27001, small team, AI narrative-drafting claims unsubstantiated in docs.

### CxAlloy TQ

- **Company:** CxAlloy, Atlanta, GA; founded 2006; ~24–26 employees;
  bootstrapped/unfunded (Tracxn). Products: CxAlloy TQ (commissioning/quality) and
  CxAlloy FM (facility maintenance).
- **Pricing:** Starts around **$355/month** (SourceForge); all subscriptions include
  **unlimited users with defined roles**; premium add-ons (Milestones, SSO, Power BI
  Connector) at higher tiers. Free trial available.
- **Features:** highly customizable workflows/templates/priorities; collaborative
  checklists & tests (template-driven, assignable to people/companies/roles); issue
  management linked to assets; asset tracking; tailored reports (claims up to 80%
  report-time reduction, and 44% closeout-time cut); custom branding/white-labeling;
  complete history/audit; **camera label-scanning (nameplate OCR)**; **Milestones**
  progress-tracking (2025, three-tier structure with Equipment Types: Rules).
  Procore integration + open API. iOS/Android with full offline sync and photo/file
  capture.
- **AI:** camera label-scanning is OCR, not generative; no generative AI
  checklist/report drafting found.
- **Compliance: ISO 27001 certified + SOC 2 attestation**, encrypted data, SSO — the
  strongest published security posture of the group.
- **Target:** mature, feature-rich platform favored by experienced CxA providers,
  contractors, facility managers; data centers, healthcare, life sciences.
- **Strengths:** proven depth, unlimited users, strong security, mature integrations.
  **Weaknesses:** "traditional" UI perceived as less modern; no generative AI
  drafting; setup learning curve.

### Facility Grid

- **Company:** Brookline, MA; CEO Eric Forman; serving "over 150 clients across
  various sectors, including data centers, healthcare, and manufacturing." Received
  a growth investment from **Nexa Equity, announced August 13, 2025** (Forman:
  "Nexa Equity's investment is a pivotal step forward for our company"). Nexa's Fund
  II reached over $390 million in commitments, hitting its hard cap in six months and
  bringing Nexa's AUM to more than $1 billion — **making Facility Grid the
  best-capitalized pure-play Cx vendor here.**
- **Pricing:** Not published; quote-based (TrustRadius shows no free
  trial/freemium, no public price).
- **Features:** Operational Readiness (OR) platform + Cx + QC modules; asset
  tracking across lifecycle; NCCx/EBCx/OCx workflows; pre-functional & functional
  performance tests built/assigned/executed from mobile; issues/observations;
  closeout/turnover packages; Closeout Tracker; Timeline Monitor; **Schedule Sync
  (P6, MS Project)**; Advanced Analytics; audit trails; Sustainability Management
  module (energy audits, tune-ups, annual inspections, ongoing performance
  monitoring) supporting LEED; CMMS export. Mobile app with field capture.
- **Integrations:** Procore (two-way sync of issues/observations, embedded in
  Procore); CMMS.
- **Target:** owner-side + GC + CxA on large, complex MEP projects (data centers,
  hospitals, airports). Emphasis on schedule integration and executive visibility.
- **Strengths:** schedule integration, owner-side visibility, funding,
  sustainability/EBCx/OCx breadth. **Weaknesses:** opaque pricing; less "field-fast"
  branding; no prominent generative-AI drafting story yet.

### Bluerithm

- **Company:** Bluerithm LLC, Minneapolis, MN; founded 2016; ~5–10 employees;
  seed-funded (TinySeed; MN DEED). President Andrew Martin. ~40,000 users and a 4.8
  rating claimed.
- **Pricing:** Custom; a starting price of **~$135/user/month** has been cited
  (PricingNow); free 30-day trial; monthly/yearly with multi-year discounts. AI
  features reportedly command higher fees.
- **Features:** highly customizable checklists/forms; asset lists; issue management;
  spreadsheet import; **built-in Gantt charts**; live dashboards; API; LEED,
  equipment startup/QC, and Test & Balance templates. **Bluerithm 2.0 (May 21,
  2026)** added: Portfolio & Project Dashboards; flexible per-project workflow
  structure; templates; **native AI checklist/form generator; AI user import; an MCP
  Server and modern API with full read/write capabilities, and support for agentic
  AI tools** (e.g., Claude Cowork for project setup); SSO/MFA/OAuth 2.0; Report
  Builder; enhanced issue management; **issue pins + PDF markups**; unified
  desktop/mobile app with light/dark mode; mobile online/offline; **localization in
  9 languages**.
- **AI:** closest philosophical match to Isotherm — tools "designed to support
  commissioning professionals, not replace their expertise," keeping "humans in
  control for review, validation, and decision-making."
- **Target:** firms of any size doing Cx, inspections, TAB, QC; strong MBCx/FDD
  narrative (structuring before/after evidence and BAS exports for verification),
  education, healthcare, data centers, energy/BESS/solar.
- **Strengths:** flexibility, T&B depth, modern 2.0 AI/agentic stack, multi-language,
  SSO/MFA. **Weaknesses:** very small team; brand/scale; AI is setup-assist, not
  schedule/drawing extraction.

### CommissioningOne / Cx One and other Cx-adjacent tools

- **CommissioningOne / "Cx One":** could not be authoritatively verified as a
  current, live product during this audit; the searchable market is dominated by
  CxAlloy, Facility Grid, Bluerithm, CxPlanner, FTQ360, XForms Cx, EXTO, and Cx
  Observer. **FTQ360** ties tests/inspections to equipment tags/subsystems/systems
  with handover packages and deficiency tracking. **XForms Cx** is a
  field-form/mobile-first Cx data-collection tool (tables, punchlists, partial-%
  credit, PWA). **EXTO** positions as an asset-centric, schedule-integrated "System
  of Record for Operational Readiness." **Cx Observer** markets AI-driven Cx
  tracking. These are niche/secondary and less directly comparable to a full
  CxA-side platform.
- **ARC Facilities:** facilities/O&M document-access and emergency-info app —
  commissioning-*adjacent* (handover/O&M info) rather than a Cx test-execution
  platform.

### Adjacent competitors used for Cx work (not true Cx platforms)

- **Fieldwire:** field/punch-list app; blueprint-pinned punch items, custom status
  workflows, real-time sync, offline, photo capture; integrates Procore, Autodesk
  BIM 360, Bluebeam. **Pricing: free Basic (5 users/3 projects); Pro $39/user/mo,
  Business $64, Business Plus $89 (annual)** — some sources cite higher ($54/$74).
  Rated 4.5 (G2) / 4.6 (Capterra). Lacks Cx test/equipment/report structure.
- **PlanRadar:** snag/punch, issue workflows, document control, photo/location
  evidence, BIM-model linkage, customizable forms/reports; strong audit
  trails/role-based access; 30-day trial. Cx-*capable* via checklists but not
  Cx-native.
- **Procore:** broad construction management (financials, RFIs, drawings,
  submittals, punch lists); BIM is an integration layer (2025 Novorender/FlyPaper
  acquisitions to close the gap). CxPlanner itself notes Procore "handles document
  management… not commissioning." Enterprise, project/volume-based pricing.

### MBCx / ongoing-commissioning analytics (different category)

Monitoring-Based Commissioning (BAS trend-data analytics, FDD, EMIS — e.g.,
SkySpark, and services from Iconergy, NORESCO, Synergy) is a distinct category
focused on continuous performance verification. Per LBNL (Kramer et al.,
"Building analytics and monitoring-based commissioning"), EMIS users reporting
savings achieved "median cost savings of $0.19/sq ft and 7 percent annually,"
while for 35 portfolio owners the "median base cost to install an EMIS was
$0.03/sq ft, with an annual recurring software cost of $0.02/sq ft." Bluerithm
and Facility Grid touch ongoing/EBCx workflows, but none of the core
Cx-management platforms is primarily an FDD/analytics engine. **If Isotherm wants
MBCx, that is a build/partner decision, not a table-stakes gap.**

---

## Feature comparison matrix

Legend: ✅ yes/strong · ⚠ partial/unclear/adjacent · ❌ no/not found · ? unknown for Isotherm.

| Feature category | CxPlanner | CxAlloy TQ | Facility Grid | Bluerithm | Fieldwire | Procore | Isotherm Cx (claimed) |
|---|---|---|---|---|---|---|---|
| Checklists (PFC/prefunctional/startup/FPT) | ✅ deep | ✅ deep | ✅ deep | ✅ deep | ⚠ generic | ⚠ inspections/punch | ✅ |
| Equipment register + nameplate data | ✅ + photo OCR | ✅ + label-scan OCR | ✅ lifecycle tracking | ✅ asset lists | ❌ | ⚠ limited | ✅ (AI-populated) |
| Cx Index / progress matrices | ✅ dashboards | ✅ Milestones | ✅ Closeout/Timeline | ✅ 2.0 dashboards | ❌ | ⚠ | ✅ + per-project applicability rules |
| Issues log (ASHRAE 202) | ✅ | ✅ asset-linked | ✅ two-way Procore | ✅ pins/markups | ✅ punch only | ✅ punch | ✅ |
| Site reports / meeting minutes | ✅ reporting module | ✅ tailored reports | ✅ | ✅ Report Builder | ⚠ task reports | ⚠ | ✅ |
| Deliverables tracking | ✅ | ✅ | ✅ turnover pkgs | ✅ | ❌ | ⚠ | ✅ |
| Cx Plan generation | ⚠ claimed, undocumented | ❌ (templates only) | ⚠ | ⚠ templates | ❌ | ❌ | ✅ AI-drafted + ratification |
| Final Cx report generation | ✅ data-compiled | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **AI document extraction (schedules/drawings)** | ⚠ P&ID tags + photos only | ⚠ OCR only | ❌ | ❌ | ❌ | ❌ | **✅ mech schedules → register** |
| AI narrative drafting | ⚠ claimed, unverified | ❌ | ❌ | ⚠ form-gen only | ❌ | ❌ | ✅ |
| Agentic AI + human approval gates | ⚠ "agent-native" marketing | ❌ | ❌ | ✅ Claude Cowork agentic | ❌ | ❌ | ✅ approval gates |
| **Self-learning equipment vocabulary** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Offline mobile field use | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ? |
| Camera capture | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Client/external view-only links | ❌ invited Viewer only | ⚠ role-based users | ⚠ stakeholder access | ⚠ dashboards | ⚠ per-seat | ⚠ | **✅ view-only links** |
| LEED/sustainability workflows | ✅ | ⚠ | ✅ Sustainability module | ✅ LEED templates | ❌ | ⚠ | ? |
| BAS/trend analysis (MBCx/OCx) | ❌ | ❌ | ⚠ EBCx/OCx module | ⚠ MBCx structuring | ❌ | ❌ | ? |
| Integrations (BIM/IFC/Procore/Autodesk) | ✅ Procore, ACC, PowerBI, Zapier; 3D viewer (no IFC authoring) | ✅ Procore, API | ✅ Procore, CMMS, P6/MSP | ✅ Procore, ACC, Revit, Willow, MCP, API | ✅ Procore, BIM360, Bluebeam | ✅ broad | ⚠ likely limited |
| API / webhooks | ✅ (Enterprise) | ✅ | ⚠ | ✅ full read/write + MCP | ✅ | ✅ | ⚠ |
| SSO / MFA | ✅ SAML (Enterprise) | ✅ SSO | ⚠ | ✅ SSO/MFA/OAuth | ⚠ | ✅ | ⚠ |
| SOC 2 / ISO 27001 | ❌ GDPR only | ✅ both | ⚠ | ⚠ "enterprise-ready" | ⚠ | ✅ | ❌ likely |
| Multi-language | ✅ 5 | ⚠ | ⚠ | ✅ 9 | ✅ | ✅ | ⚠ |
| Pricing model | per-user + company tier | per-company, unlimited users | quote-only | per-user custom | per-user | project/volume | in-house |

### The "?" cells, filled from internal knowledge

*The audit notes Isotherm's column is based on the differentiators stated in the
brief, not independently verified, and asks that the `?` cells be filled in-house.
From the codebase and docs, as of 2026-08-05:*

- **Offline mobile field use — ✅ with a named limitation.** `checklistOutbox` is a
  durable offline write queue; ARCHITECTURE records its photo limitation. Field
  resilience ("phone-usable in mechanical rooms, poor light, gloves, haste") is an
  explicit product principle in PRODUCT.md.
- **LEED/sustainability — ⚠ partial.** The deliverables model carries a LEED
  deliverable; Envelope BECx is modelled but dormant. No sustainability *module*.
- **BAS/trend analysis (MBCx/OCx) — ❌ today, by decision.** Specified in
  `docs/BAS-SPEC.md` and parked as BACKBURNER entry 9 on a **commercial trigger**.
- **Multi-language — ❌.** English only; not on the shelf.

---

## Where Isotherm Cx appears unique or ahead

1. **AI extraction from mechanical schedules into the equipment register:** No
   competitor *documents* parsing tabular mechanical schedule PDFs into an asset
   register. CxPlanner and CxAlloy do P&ID/nameplate OCR only; CxPlanner's
   "populate asset list from O&M manuals" is an aspirational "imagine" claim.
   **This is Isotherm's strongest genuine lead.**
2. **AI-drafted Cx Plans with human ratification:** CxPlanner claims this only in
   marketing; Bluerithm's AI generates forms/checklists, not plan prose. A working
   AI-drafted Cx Plan with an explicit ratification workflow would be ahead of
   documented competitor capability.
3. **Agent-based architecture with human approval gates:** Bluerithm 2.0 (Claude
   Cowork) is the closest; CxPlanner claims "agent-native." Isotherm's explicit
   approval-gate design is competitive but **no longer wholly unique — treat
   Bluerithm as a fast follower.**
4. **Self-learning equipment-type vocabulary:** No competitor advertises this.
   Likely unique.
5. **Per-project applicability rules on commissioning matrices:** CxAlloy
   Milestones has "Equipment Types: Rules" evaluation and per-project
   configuration; Bluerithm 2.0 has flexible per-project structure. Isotherm's
   applicability rules are competitive but **partially matched — differentiate on
   granularity.**
6. **External view-only share links:** Genuinely ahead of CxPlanner (no public
   link). CxAlloy/Bluerithm/Facility Grid use role-based invited access, not
   anonymous links. A no-login view-only link is a real UX/commercial
   differentiator.

## Gaps a proprietary in-house platform likely has

- **Security attestations (SOC 2 / ISO 27001):** CxAlloy has both; owner-side
  data-center/hyperscale clients increasingly require them. **This is the single
  biggest commercialization blocker.**
- **SSO/MFA/OAuth, API/webhooks:** table stakes at enterprise tier for CxAlloy,
  Bluerithm 2.0, CxPlanner Enterprise.
- **BIM/IFC integration & 3D model viewing:** CxPlanner (3D viewer + ACC),
  Bluerithm (Revit/ACC/Willow), Fieldwire/Procore (BIM360). IFC ingestion is a
  common owner requirement.
- **Scheduling Gantt / schedule sync (P6, MS Project):** Facility Grid Schedule
  Sync, Bluerithm Gantt, CxPlanner MS Project import.
- **Multi-language:** Bluerithm 9, CxPlanner 5 — relevant only if Isotherm goes
  international.
- **Third-party review presence & benchmarking data:** incumbents have G2/Capterra
  footprints and portfolio benchmarking; an in-house tool has none.
- **Ongoing/MBCx and CMMS export:** Facility Grid and Bluerithm touch these;
  owner-side buyers increasingly ask.

---

## Market & pricing context (build-vs-buy)

- **Purpose-built Cx tools:** CxPlanner ~$65–95/user/mo (Pro) or $430–640/mo company
  (Business); Bluerithm ~$135/user/mo custom; CxAlloy ~$355/mo with **unlimited
  users** (a materially different, often cheaper model at scale); Facility Grid
  quote-only (enterprise).
- **Adjacent tools:** Fieldwire $39–89/user/mo; Procore project/volume-based (often
  five-figure annually).
- **Interpretation:** For a firm the size of Isotherm, CxAlloy's unlimited-user
  model is the cheapest at headcount scale, while per-user tools (CxPlanner,
  Bluerithm) get expensive as you add subcontractors/viewers — **which is exactly
  why Isotherm's view-only links have commercial value.** If Isotherm ever
  commercializes, a hybrid "unlimited internal users + free external viewers + AI as
  the premium tier" model would undercut per-seat incumbents while monetizing the AI
  schedule-extraction lead. The AI-premium-tier trend is already visible
  (Bluerithm's AI features reportedly command higher fees).

---

## Recommendations

1. **Stage 1 — Protect and document the AI lead (0–3 months).** Formalize and
   demo-record the two features no competitor documents: (a) mechanical-schedule →
   equipment-register extraction, and (b) AI-drafted Cx Plan with ratification.
   Benchmark speed/accuracy against CxPlanner's P&ID extraction and Bluerithm's form
   generator. *Threshold to escalate to commercialization: extraction accuracy on
   real mechanical schedules exceeding ~90% with human review taking <20% of the
   manual time.*
2. **Stage 2 — Close enterprise-plumbing gaps before any external sale (3–9
   months).** Prioritize SOC 2 Type I (then II) or ISO 27001, SSO/MFA, and a
   documented API/webhook layer. *These are gating requirements for
   data-center/hyperscale and owner-side buyers; without them, do not pursue
   owner-side deals.* CxAlloy's dual SOC 2 + ISO 27001 is the bar.
3. **Stage 3 — Decide build-vs-buy vs commercialize (6–12 months).** If internal
   usage is the only goal, keep building — the tool already exceeds
   Fieldwire/Procore for Cx and matches incumbents on core Cx. If commercializing,
   position as an **AI-first, CxA-side tool with unlimited internal users + free
   external view-only links**, priced to undercut CxPlanner/Bluerithm per-seat while
   charging an AI-premium tier. *Change this plan if a funded incumbent (Facility
   Grid, post-Nexa; or CxPlanner, post-Compounding Capital) ships documented
   mechanical-schedule extraction — at that point the extraction-lead window closes
   and Isotherm should pivot to depth/UX or pursue partnership/exit.*
4. **Stage 4 — Add BIM/IFC ingestion and MS Project/P6 schedule sync** only if
   pursuing owner-side/large-project buyers; these are common RFP line items. Defer
   MBCx/FDD (separate category) unless a client specifically demands ongoing
   commissioning.

---

## Caveats

- **CxPlanner's most impressive AI claims (narrative Cx-Plan drafting; asset-list
  population from O&M manuals) are marketing-page assertions not corroborated by its
  help center** and use aspirational language ("Imagine…", "generates the draft for
  you"). Treat as unverified until confirmed by demo. This directly affects how
  "ahead" Isotherm is — the gap may be real, but confirm CxPlanner's live capability
  before making competitive claims publicly.
- **Pricing figures conflict across aggregators** (SoftwareSuggest, ITQlick,
  Software Finder, SourceForge, PricingNow) and are frequently estimates; only vendor
  pages are authoritative, and several vendors (Facility Grid, exact CxAlloy tiers,
  Bluerithm) do not publish per-seat prices. All figures are 2025–2026 and subject to
  change.
- **Facility Grid and CxAlloy funding/employee figures** come from
  Crunchbase/Tracxn/LeadIQ/PitchBook, which can be stale or estimated; the Nexa
  Equity investment (Aug 13, 2025) and CxPlanner–Compounding Capital investment are
  press-confirmed but of undisclosed amounts.
- **G2/Capterra review depth for CxPlanner is thin** (profiles largely unreviewed),
  so its "strengths/weaknesses" rely more on vendor/aggregator descriptions than on
  verified user reviews.
- **"CommissioningOne / Cx One" could not be authoritatively verified** as a current
  product; if it is a specific vendor the owner has in mind, provide the URL for a
  targeted follow-up.
- **Isotherm Cx's own matrix columns are based on the differentiators stated in the
  brief**, not independently verified; the `?` cells have been filled from internal
  knowledge in the section above.

---

## The decisions this audit drove

*Ruled 2026-08-05. These are recorded here because they govern the backlog; the
audit above is the evidence, this section is the response to it.*

### Four items entered the backlog

Recorded in [BACKBURNER.md](BACKBURNER.md) under **Market-informed backlog**,
each with a wake condition rather than a queue position:

| | Entry | Wakes |
|---|---|---|
| **3g** | Schedule sync + Gantt — P6 / MS Project import, Cx activities against construction milestones, slippage on the dashboard | after the checklist canon completes, **or immediately** if a GC hands us a real schedule and asks |
| **3h** | Drawing-pin findings — absorbs the Build Spec §6C drawing-markup idea | same, or the first field request |
| **3i** | Nameplate-photo OCR — the extractor's vision leg aimed at the plate on the machine | after the extractor's field-hardening settles |
| **3j** | Spec / document Q&A — an agent over uploaded project specs | with the FPT campaign, same machinery neighbourhood |

Each has at least one incumbent shipping it (3g: Facility Grid Schedule Sync,
Bluerithm Gantt, CxPlanner MS Project import · 3h: CxPlanner issue markup,
Bluerithm 2.0 issue pins + PDF markups · 3i: CxPlanner photo/nameplate
recognition, CxAlloy camera label-scanning · 3j: CxPlanner "ask your specs"),
which is why they are backlog rather than research.

### Tier-3 enterprise items are deliberately NOT backlogged

**SOC 2 / ISO 27001 · SSO · public API · BIM/IFC · multi-language.**

These are **gated on a commercialization decision**, not on engineering
readiness, and that decision gets its own sitting after the plan closes. They are
not on the shelf because the shelf is for work that has been *decided and
deferred* — these have not been decided.

**The audit agrees, and sharpens it.** Its Stage 2 is explicit: these are *"gating
requirements for data-center/hyperscale and owner-side buyers; without them, do
not pursue owner-side deals"* — a **conditional** on a commercial decision, not a
product gap. Building them speculatively is cost without benefit: each is
expensive, each is only valuable if the product is sold outside the firm, and each
would be built against guesses about a buyer nobody has met.

### MBCx does not move

**It stays exactly where BAS-SPEC put it: a commercial trigger.** When it fires it
jumps everything. The audit independently reaches the same conclusion — *"If
Isotherm wants MBCx, that is a build/partner decision, not a table-stakes
gap"* — and its Stage 4 defers MBCx/FDD unless a client demands it.

### The framing that survives from §6C

The Build Spec's §6C already said it, from earlier competitive research, and this
audit did not overturn it:

> *"Isotherm's edge is fit — tailored to its exact forms and workflow — not
> feature-parity with enterprise tools. Add these selectively."*

### One cross-reference worth making

The audit's **Stage 1 escalation threshold** is *"extraction accuracy on real
mechanical schedules exceeding ~90% with human review taking <20% of the manual
time."*

The extractor calibration campaign
([EXTRACTOR-CALIBRATION-PROPOSAL.md](EXTRACTOR-CALIBRATION-PROPOSAL.md), closed
2026-08-05) measured exactly this on four real TDSB sets: Clairlea M-601 returned
**88/88 physical units**, per-region exact against hand counts, and p16 returned
11/11. That is the accuracy half of the threshold, met on the hardest pages in the
corpus.

**The second half — human review under 20% of manual time — has not been
measured.** It is a stopwatch question about the review screen, not the extractor,
and nobody has timed it. Stated here so the threshold is not read as met.
