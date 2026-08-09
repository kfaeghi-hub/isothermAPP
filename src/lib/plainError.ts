/**
 * Database constraint names → sentences a person can act on.
 *
 * The constraints ARE the design and they must stay — but Postgres's own text
 * ("new row for relation … violates check constraint …") is not something anyone
 * standing in a mechanical room should have to read. The UI's job is to make the
 * refusal unreachable; this is what shows if it is reached anyway.
 *
 * Its own module so it can be unit-tested against REAL constraint messages. It
 * lived inline in ISTPage first, and the browser suite could only assert it with
 * a `check(true, …)` — a check that cannot fail, which is the founding sin of
 * this codebase's guard family. Moving it here made the assertion possible.
 */
export const PLAIN_ERRORS: [RegExp, string][] = [
  [/ist_prerequisites_yes_needs_evidence/,
   'Marking this YES needs a note saying where the document is — a title and a location is enough.'],
  [/ist_protocols_kind_shape/,
   'That protocol’s details do not match its kind — a condition needs a condition type, a point needs a device code.'],
  [/ist_integrations_distinct_systems/,
   'An integration has to be between two different systems.'],
  [/ist_notes_scope_target/,
   'That note is scoped to something it does not point at.'],
  [/one_per_protocol_per_session/,
   'This protocol already has a result recorded in this session.'],
]

export function plainError(message: string): string {
  for (const [re, plain] of PLAIN_ERRORS) if (re.test(message)) return plain
  return message
}
