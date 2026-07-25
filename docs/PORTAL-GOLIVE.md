# PORTAL-GOLIVE.md — the runbook for the first real external user

**Status: NOT STARTED. Nothing in this document has been performed.**
Written 2026-07-25 as a runnable procedure, to be executed the day a real external
user has a name. Work the steps **in order** — each one's verification is the gate
on the next. If a verification fails, stop there; do not proceed and fix later.

As-built reference: ARCHITECTURE "External project portal — the security model".
Everything below assumes Part A + Part B are deployed and the battery is green.

---

## Pre-flight (do these first, they cost nothing)

- [ ] **P1. Confirm the boundary still holds.** `node --env-file=.env pw-portal.mjs`
      → PASS, and `node run-battery.mjs` → 19/19.
      *Verification:* both green **today**, not "green last week". The portal suite
      asserts zero mail, so running it proves the flag is still off.
- [ ] **P2. Confirm no live portal state exists yet.** As admin:
      `select count(*) from portal_members;` and `from portal_invites;`
      *Verification:* both **0**. If either is non-zero, something was created outside
      this runbook — find out what before sending anything.
- [ ] **P3. Decide the document identity question.**
      `docs/DOCUMENT-IDENTITY-DECISION.md`. The first external user is exactly the
      person who sees both identities in one session, so decide before they do —
      either answer is fine, an undecided answer is not.

---

## 1. Flip `PORTAL_INVITES_LIVE`

Delivery is read in exactly one function, `deliverInvite()` in `api/portal-invite.ts`.
Nothing else in the invite or redeem path consults it.

- [ ] **1a.** Set `PORTAL_INVITES_LIVE=true` in the Vercel project's **Production**
      environment. Redeploy (env changes do not apply to existing deployments).
- [ ] **1b.** Confirm the send path is actually wired. **As of writing it is not** —
      `deliverInvite()` is the seam, and it needs a real transport (the Auth mailer is
      a separate channel and is NOT it). Until it is wired, the flag changes nothing
      and the copy-link remains the delivery mechanism, which is a legitimate way to
      go live: **you can do step 2 by hand with the copy-link and skip 1a entirely.**
      Decide which, and write down which you chose.

*Verification:* the response's **two** flags distinguish all three states — read them
together, because either one alone is ambiguous:

| `delivery_enabled` | `mail_attempted` | State |
|---|---|---|
| `false` | `false` | Flag off. Copy-link is delivery. **This is today.** |
| `true` | `false` | **Flag on, no transport wired.** The invite is still valid and redeemable; nothing was sent. A `[portal-invite] PORTAL_INVITES_LIVE is true but no transport is wired` warning is in the function logs. |
| `true` | `true` | Flag on, transport wired, send attempted. |

Confirmed in code at time of writing: `deliverInvite()` has **no transport** — with
the flag on it logs that warning and returns `attempted: false` rather than failing
the invite. So flipping the flag alone moves you to row 2, not row 3. If you see
`delivery_enabled: false` after flipping, the flag did not take: check the
environment scope is Production and that the deployment being served is the new one.

---

## 2. Send exactly ONE real invite — to Tony's own address

The first real invite goes to **kfaeghi@gmail.com**, not to a client. This is the
rehearsal: everything a client will experience, experienced first by the person who
can fix it.

- [ ] **2a.** Choose the project. Use a **real** project you own or lead — the invite
      endpoint enforces owner-or-lead in code, and the point is to see real content.
      **Not ZZ-TEST**: this is the appearance rehearsal, and ZZ-TEST's data is noise.
- [ ] **2b.** Send one invite, to that address, on that project. One. Not two.
- [ ] **2c.** Record the `invite_id` returned, so it can be revoked cleanly (§6).

*Verification:* `select email, expires_at, redeemed_at, revoked_at from
portal_invites;` shows exactly **one** row, unredeemed, expiring ~7 days out, and
`token_hash` is a 64-character hex string that appears **nowhere** in the response
body or any log. The raw token exists only inside the link.

---

## 3. The Supabase Auth-mailer review

**The single item most likely to embarrass us**, and the reason it has been carried
since Part A. `PORTAL_INVITES_LIVE` controls *our* mail. Supabase's Auth service is a
**second, independent channel** we do not gate — it sends password-reset and
confirmation mail on its own templates, its own sender, its own copy.

Redemption already calls `createUser({ email_confirm: true })`, which suppresses the
confirmation mail. **Password reset is not suppressed and never will be** — an
external user who forgets their password will receive whatever Supabase sends.

- [ ] **3a.** Read the templates as they stand: Supabase dashboard → Authentication →
      Emails. Capture **Reset Password** and **Confirm Signup** verbatim.
- [ ] **3b.** Answer these four, in writing:
      1. **Sender** — what address and display name does it come from? A bare
         `noreply@mail.app.supabase.io` tells a client their consultant's portal is
         somebody else's software.
      2. **Branding** — is there any Isotherm identity at all, or is it default
         Supabase?
      3. **Copy** — does it read like it is addressed to an external project member,
         or to a developer signing up for a SaaS?
      4. **Link target** — where does the reset link land, and does that page belong
         to the portal world (cover ground, lockup) or the internal app's login?
- [ ] **3c.** **Screenshot them without mailing a real person.** Trigger a reset for
      **dev.client** (credentials in `.env`) — that account is ours and its inbox is
      not a client's. If dev.client's address is not an inbox you can read, create a
      throwaway on an address you control and delete it afterwards; **do not** trigger
      a reset against any directory contact or any address you do not own.
- [ ] **3d.** Fix what needs fixing before a client can hit it: custom SMTP with an
      Isotherm sender, Isotherm-branded templates, and copy written for an external
      project member.

*Verification:* a real screenshot of the actual reset email, and a written answer to
each of the four questions above. **"It's probably fine" does not close this item** —
the point of the whole exercise is that nobody has looked yet.

---

## 4. Verify the invite email's rendered appearance

Only meaningful if the send path from §1b was wired; skip if going live on copy-link.

- [ ] **4a.** Open the invite from §2 in the client you actually expect — phone Gmail
      first, since a GC PM opens mail on a phone.
- [ ] **4b.** Check: sender identity, subject line, that the link is not mangled by a
      link-scanner, that it renders in plain-text-preferring clients, and that nothing
      trips a spam filter (check the spam folder before declaring success).
- [ ] **4c.** Follow the link on that phone. `/portal/accept` is a cover surface —
      confirm the lockup, the contour, the form, and 44px tap targets.
- [ ] **4d.** Complete redemption as yourself and walk the whole record: hero
      instrument, register (filter it, sort it, open a photo), download a document in
      both formats, read the team card. **On the phone**, at real size.

*Verification:* you have used the portal as a client, on a phone, end to end. This
also discharges the carried real-device confirmation.

---

## 5. First real invitee — criteria

Tony's call, made against these:

- [ ] **5a.** A **named individual** on a **real, active** project — not a distribution
      list, not `info@`, not a role address. Every view is an identity; a shared
      mailbox destroys that.
- [ ] **5b.** A project whose record is worth showing: issued documents present,
      register populated, team matrix filled. An empty portal is a bad first
      impression even with perfect empty states.
- [ ] **5c.** Someone who will **tell you** if it is confusing. The first external
      user is a source of feedback, not a launch.
- [ ] **5d.** Tony is owner or lead on that project (the endpoint enforces it).
- [ ] **5e.** Tell them out-of-band that it is coming, so the invite is expected.

*Verification:* name, project, and date written down before the invite is sent.

---

## 6. Cleanup after the rehearsal

- [ ] **6a.** Decide whether to keep Tony's own portal membership. Keeping it is
      useful — a permanent client's-eye view of a real project. Removing it is
      `delete from portal_members where …`, and revocation is instant and total.
- [ ] **6b.** If any throwaway account was created in §3c, delete it (`auth.users`;
      `user_profiles` and `portal_members` cascade).
- [ ] **6c.** Re-run `pw-portal.mjs`. **Expect it to FAIL, and expect exactly one
      failure:** `MAIL: PORTAL_INVITES_LIVE is off`. That assertion is true today and
      becomes false the moment step 1a lands — it is the suite correctly reporting
      that the world changed.
      What to do about it is a **judged** change, not a green-restoring one. The
      sibling assertion `MAIL: no delivery attempted` must **not** be loosened: it is
      the one that guarantees a test run cannot mail a real person. Options: point the
      suite at a non-production base URL where the flag is off, or replace the
      flag-state assertion with one that proves the *test's* invite went nowhere.
      Either way, record which and why. **Never let a suite go green by weakening what
      it claims** — that is the whole failure mode this project keeps catching.

---

## What this runbook deliberately does NOT do

- It does not send anything to a client, a directory contact, or any address not
  owned by Isotherm, at any step.
- It does not touch `project_members`. External access is `portal_members`, always.
- It does not re-issue or re-render any issued document (rule 4).
- It does not treat a green test as evidence that mail works, or a silent inbox as
  evidence that mail is off. Each is checked directly, on its own signal.
