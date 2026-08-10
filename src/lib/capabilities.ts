/**
 * CAPABILITIES — one definition per question, instead of one predicate copied
 * eleven times.
 *
 * `['admin', 'developer', 'owner'].includes(role)` appeared in eleven places and
 * answered at least six different questions: who configures the firm, who sees
 * portfolio-wide dashboards, who deletes a completed checklist, who hard-deletes
 * equipment. They looked identical and were not the same rule — so widening any
 * one of them meant either editing a string in eleven files or leaving ten copies
 * that no longer state a single policy.
 *
 * Naming them separates the questions. The **next** widening is then a one-line
 * change in one place, and it is visibly a decision about a named capability
 * rather than a search-and-replace.
 *
 * NOTE ON SCOPE: everything here is a UI-affordance answer. **The enforcement is
 * RLS.** These functions decide whether to render a control; the database decides
 * whether the write lands. Where the two disagree the database wins, which is why
 * `canHardDeleteEquipment` had to change in lockstep with its policy — a widened
 * button over an unchanged policy produces a silent no-op, which is worse than a
 * hidden button.
 */

export interface CapProfile { role?: string | null; name?: string | null }

/** admin · developer · owner. The historical trio, kept as ONE definition so the
 *  places that genuinely mean "a governor" all move together if it ever changes. */
const isGovernor = (p?: CapProfile | null) =>
  ['admin', 'developer', 'owner'].includes(p?.role ?? '')

/** Firm-wide configuration: classifications, template library, the vocabulary. */
export const canConfigureFirm = isGovernor

/** Portfolio-wide dashboard views — seeing beyond one's own memberships. */
export const canSeePortfolioViews = isGovernor

/** Project-level administration: edit/delete a project, manage its team. */
export const canAdministerProject = isGovernor

/** Hard-delete a finding from the issues log. */
export const canHardDeleteFinding = isGovernor

/**
 * HARD-DELETE EQUIPMENT — the one that changed, 2026-08-10.
 *
 * Was governors only. Now: **any project member**, because the protection was
 * never really the role — it is the REFERENCES. A unit with findings is blocked
 * for everyone; a unit with checklist work is blocked by a foreign key for
 * everyone; a clean unit is a typo somebody should be able to fix without asking
 * an owner.
 *
 * `isMember` is passed in rather than computed here: membership is a project
 * fact the caller already holds, and RLS is what actually enforces it. This
 * function only decides whether to draw the button.
 */
export const canHardDeleteEquipment = (p: CapProfile | null | undefined, isMember: boolean) =>
  isGovernor(p) || isMember

/** Reopen a completed checklist — governors, or the person who completed it. */
export const canReopenChecklist = (p: CapProfile | null | undefined, completedBy?: string | null) =>
  isGovernor(p) || (p?.name != null && p.name === completedBy)

/** Delete a checklist instance — governors any; members only while incomplete. */
export const canDeleteChecklistInstance = (p: CapProfile | null | undefined, status?: string | null) =>
  isGovernor(p) || status !== 'complete'

/** Delete a meeting — governors any; employees their OWN drafts. */
export const canDeleteMeeting = (
  p: CapProfile | null | undefined, status?: string | null, preparedBy?: string | null,
) => isGovernor(p) || (status === 'draft' && preparedBy === p?.name)

/** Delete a site report — governors any; employees their OWN ungenerated drafts. */
export const canDeleteSiteReport = (
  p: CapProfile | null | undefined, hasGeneratedDoc: boolean, authoredBy?: string | null,
) => isGovernor(p) || (!hasGeneratedDoc && authoredBy === p?.name)
