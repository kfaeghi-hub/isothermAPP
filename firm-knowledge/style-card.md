# Style card — how Isotherm documents are written

Part of the Firm Knowledge Layer. Read by `ai-common` into every drafting call.

**Extracted from three issued plans** (Humber, Mulock, Seneca), 2026-07-26. Every
rule below is a pattern observable in those documents, not a preference. Where the
samples disagree with each other, the ruling is stated and the loser is named —
drift between two copies of one master is precisely what this card exists to stop.

---

## Person and voice

- **Third person throughout. The firm is named; never "we".**
  > "Isotherm Engineering Ltd. (Isotherm), as the independent Commissioning
  > Authority (CxA), has been retained by ⟨CLIENT⟩ (the Client) for the
  > commissioning of ⟨SCOPE⟩."
- First mention of the firm is the **full legal name with the short form in
  parentheses**; thereafter "Isotherm".
- The client is **"(the Client)"** on first mention, then by name or "the Client".
- Never address the reader. No "you", no "our team".

## Modal discipline — the rule that matters most

This is how the document assigns obligation. Getting it wrong changes what the
document *means* contractually.

| Modal | Means | Example from the samples |
|---|---|---|
| **shall** | A contractual obligation on **another party** | "Appendices **shall** contain acquired sequence documentation, logs, progress reports…" |
| **will** | What **Isotherm** intends to do | "Isotherm **will** develop commissioning protocols for approval by the Client" |
| **is / are** | A statement of fact about the project or the document | "The Cx Plan **is** a living document." |

**Never** use *should*, *must*, or *may* for obligations. *Should* is advice,
*must* duplicates *shall* inconsistently, and *may* creates ambiguity about
whether something is required.

## Sentence discipline

- **One idea per sentence.** Median sentence in the samples runs 22–28 words;
  treat 35 as the ceiling.
- No sentence opens with a conjunction.
- No rhetorical questions. No em-dash asides in body prose (they belong in tables).
- **Actor in parentheses when responsibility shifts.** This convention is
  load-bearing — it is how the document assigns work at line level:
  > "Pipe flushing and cleaning **(by the contractors)**"
  > "Equipment initial startup checks **(by the contractors or manufacturer/suppliers)**"
  > "Functional Performance Testing (FPT) **by Isotherm**"

## Spelling and form

- **Canadian spelling.** `-our` (behaviour, colour, favour), `-re` (centre,
  metre), `-ize` per Oxford (organize, recognize), `licence` (noun) /
  `license` (verb), `practise` (verb) / `practice` (noun).
- **Dates ISO**: `2025-02-24`. Never "Feb 24, 2025", never "24/02/2025".
- **Abbreviations defined on first use, full term first**: "Functional
  Performance Testing (FPT)". Thereafter the abbreviation alone.
- **Units** with a non-breaking space and SI where the source allows; imperial in
  parentheses only when the equipment schedule uses it.
- Serial comma **not** used, matching the samples.

## Structure

- **Every heading opens with a prose paragraph before any list.** No orphan
  headings — a heading followed immediately by bullets is a defect.
- **Tables are introduced by a sentence that names them.**
  > "The commissioning team is detailed in the table below:"
- **Bullets are noun phrases or imperative fragments**, not sentences. No
  terminal period unless the bullet is a full sentence. Parallel grammatical form
  within a list.
- Paragraphs run 2–5 sentences. A one-sentence paragraph is a deliberate emphasis,
  used sparingly.

## Never

- **Marketing language.** No "cutting-edge", "world-class", "seamless",
  "state-of-the-art", "robust", "leverage", "best-in-class".
  *Note: the samples contain "state-of-the-art" and "seamless operation". Those
  are the drift this card exists to stop, not precedent to follow.*
- **Claims about performance the commissioning has not yet verified.** The plan
  describes what will be verified; it does not assert the outcome.
- **Any number, date, name, quantity or standard not present in the supplied
  facts.** If a fact is absent, omit the claim. Never estimate, never generalise,
  never emit a placeholder like `[Insert GFA]` — an issued plan in our own
  samples carries exactly that, and it is an error, not a pattern.
- **Hedging.** "It is anticipated that", "generally speaking", "as appropriate"
  where a specific requirement belongs.

## Worked contrast

> ❌ "We'll be leveraging our world-class commissioning expertise to seamlessly
> validate that the state-of-the-art HVAC systems should perform optimally."

> ✅ "Isotherm will verify that the HVAC systems perform in accordance with the
> Owner's Project Requirements. Testing shall be witnessed by the Mechanical
> Contractor (by the contractors)."
