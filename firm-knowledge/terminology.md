# Terminology — controlled vocabulary and rulings

Part of the Firm Knowledge Layer. Read by `ai-common` into every drafting call.
Edited by PR, ratified by Tony. Nothing here is inferred by a model.

---

## Role designations — RULED 2026-07-26 (D1a)

| Abbreviation | Expansion | Use when |
|---|---|---|
| **CxA** | **Commissioning Authority** | Isotherm holds the independent authority role — reviewing design, directing the process, ruling on acceptance |
| **CxP** | **Commissioning Provider** | Isotherm provides commissioning services under another party's authority |

**"Commissioning Agent" is RETIRED.** Do not use it in new documents.

**Why this needed a ruling.** Our own three reference plans disagreed:

| Document | Text as issued |
|---|---|
| Mulock (Rev 0) | "the independent Commissioning **Agent** (CxA)" |
| Seneca (Issued for Tender) | "the Commissioning **Authority** (CxA)" — 8 occurrences |
| Humber | "the independent Commissioning **Provider** (CxP)" |

`CxA` expanded to **two different words** in documents we issued to clients.
"Authority" wins because it is the term used in ASHRAE Guideline 0 and in the
CSA/LEED vocabulary our clients read, and because it is what the tender-tier plan
already uses consistently. "Agent" carried no distinct meaning — it was a synonym
that drifted in.

Existing issued documents are **frozen** (rule 4) and keep whatever they said.
This governs new composition only.

---

## Standing terms

| Term | Form | Notes |
|---|---|---|
| Isotherm Engineering Ltd. | Full legal name on first mention, then **Isotherm** | Never "IEL" in prose; `IEL` appears only in filenames and `revision_label` |
| Cx | Never expanded after the title block | "Cx Plan", "Cx Index", "Cx Meeting" |
| Commissioning Plan (Cx Plan) | Defined on first mention | |
| Owner's Project Requirements (OPR) | Defined on first mention | |
| Basis of Design (BOD) | Defined on first mention | |
| Functional Performance Testing (FPT) | Defined on first mention | |
| Installation Verification Checklist (IVC) | | |
| Prefunctional Checklist (PFC) | | |
| Testing, Adjusting and Balancing (TAB) | | |
| Integrated Life Safety (ILS) | Systems testing | |
| the Client | Capital C, after first naming the client | |
| the Owner | Capital O, when distinct from the Client | On several projects these differ |

---

## Team-matrix role abbreviations

These are **data**, rendered from the project team matrix — never invented by a
model. Listed so drafted prose refers to them correctly.

`CLI` Client · `OWN` Owner · `PM` Project Manager · `CxA`/`CxP` Isotherm ·
`ARCH` Architect · `DES` Mechanical Engineer · `ELE` Electrical Engineer ·
`BAS` Controls · `GC` General/Main Contractor · `MC` Mechanical Contractor ·
`EC` Electrical Contractor · `TAB` Balancing Contractor

A seat with no assigned company renders **TBD** — that is a real state and the
prose must not paper over it.

---

## Reference standards we cite

Cite only where the project actually invokes them. Never assert a standard
applies because it usually does.

- **ASHRAE Guideline 0** — the commissioning process framework (the tender-tier
  plan cites Guideline 0-2005 explicitly)
- **CSA Z320** — building commissioning
- **LEED v4 / v4.1** — where the project pursues certification; name the level
  only when the project data carries it
