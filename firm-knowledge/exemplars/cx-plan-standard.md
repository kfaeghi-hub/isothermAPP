# Exemplar — Cx Plan, standard tier

**Skeletons only (ruling D7).** This is Isotherm's own boilerplate with merge
fields, derived from the shared Humber/Mulock master. No client text is stored
here — full client documents would breach the ShareSync rule.

Merge fields: `⟦client⟧` `⟦cx_role⟧` (per terminology.md: "Commissioning
Authority (CxA)" or "Commissioning Provider (CxP)") `⟦scope⟧` `⟦project⟧`
`⟦facility⟧` `⟦systems_list⟧`.

Tags: **B** boilerplate · **D** data · **N** narrative.

---

## 1 · Executive Summary — B + N

> Isotherm Engineering Ltd. (Isotherm), as the independent ⟦cx_role⟧, has been
> retained by ⟦client⟧ (the Client) for the commissioning of ⟦scope⟧. This
> project aims to enhance operational efficiency, reliability, and safety, and
> align with environmental sustainability goals.

The first sentence is boilerplate with three merge fields. A second sentence
(**N**) may state the project's specific intent when the questionnaire supplies
it; omit rather than pad.

## 2 · Project Overview

### 2.1 Background — N

Drafted from questionnaire facts: *what is being built · where · why now*.
Two to four sentences. Ends with the systems served, from the register (**D**):

> Systems served by the new equipment include ⟦systems_list⟧.

### 2.2 Commissioning Plan — B

> The Project Commissioning Plan (Cx Plan) describes the commissioning process
> for ⟦project⟧. The goals, intent, requirements, and timing of the process are
> included in the plan to provide a guide on how the process is to be executed
> and documented. Additional detailed requirements and procedures are provided in
> the project specifications and the appendices of this Commissioning Plan. The
> contract documents describe the process and provide the construction
> checklists, test procedures, forms, and other requirements to guide the
> commissioning activities. The Final Commissioning Plan/Cx Report covers all
> components of the commissioning process, including the following:

- Installation Checks
- Initial Startup and Testing
- Equipment Safeties Check
- Control System Verification
- Load Response Testing

## 3 · Commissioning Team — B + D

> A primary function and the key to an effective commissioning process is to
> ensure well-defined lines of communication between all parties involved in the
> project. Communication is maintained throughout the project through the
> conscious effort of the ⟦cx_role⟧ and contractors.
>
> The commissioning team is detailed in the table below:

**The table is rendered from the project team matrix verbatim** — role label with
abbreviation, company, contact names, phone, email, and `TBD` for unassigned
seats. The model never writes this table and is never shown it as prose.

## 4 · Roles and Responsibilities — B + N

> The Specifications and contract documents describe and explain the roles and
> responsibilities of those participating in the commissioning process. The Cx
> Plan here only explains the process and substantiates each team member's
> interrelationship. If questions arise, the specifications take precedence.

Followed by one line per participating party (**N**, seeded from the matrix):

> ⟦company⟧: ⟦one-line responsibility⟧

## 5 · Commissioning Process Overview — N

Drafted from questionnaire answers about kickoff, protocol approval, execution
and the post-FPT review meeting. Three to five sentences.

## 6 · Installation and Startup Testing Procedures — B + D

*(Heading ruled D2, 2026-07-26 — "Startup" is a distinct activity.)*

> Installation checks and testing protocols will ensure the system and its
> components are installed correctly and function as intended. Procedures will
> include:

Bullets come from the **procedure library**, pre-selected by the project's
systems and toggleable.

## 7 · Operational Testing — N + D

Narrative on what operational testing covers for this project, then the fixed
deliverable lines (**D**):

- Functional Performance Testing (FPT) by Isotherm
- Training for Operation and Maintenance Staff (GC)
- Issue O&M Manual (GC)

## 8 · Training for Operation and Maintenance Staff — B *(optional, D5)*

## 9 · Project Coordination — B *(optional, D5)*

## 10 · Documentation and Deliverables — B + D

> The turnover documentation at the end of the Commissioning Process is intended
> to leave a legacy of the scope and result of the works and complete
> documentation for the facility staff and the Owner to use for the operation and
> maintenance of the building.
>
> Appendices shall contain acquired sequence documentation, logs, progress
> reports, deficiency lists, site visit reports, findings, unresolved issues,
> communications, etc.
>
> The required contractors' submittals are:

Submittals list from project data (**D**).

## 11 · Conclusion — B

## 12 · Appendix — D

Each appendix renders as a **titled reference to the living record**, never an
embedded stale copy.
