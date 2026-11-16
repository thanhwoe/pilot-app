# Example: a whole spec

From `thanhwoe/pilot-app` `docs/specs/55.md`, which passed gate 1 in one round, built with no
change to its criteria, and passes `lint-spec.mjs`. Copied as it was at gate 1, below the line.

Why it is a good model:
- Two criteria, each one behaviour with an outcome a test reads: the field "still holds my edit and
  the error shows", the code step "with my email in its prompt". No "works correctly".
- AC 1 is the failure the issue reports; AC 2 keeps today's success path, so the fix can't trade
  one for the other.
- The first assumption says what happens if the bug doesn't reproduce, so the build has an answer.
- The matrix names each test's file, and the existing one by its test name. The new test says
  which existing test it is modelled on.
- Out of scope repeats the issue's non-goals and names the neighbouring fix (#51) it must not touch.

One rule is newer than this spec: an assumption that promises a behaviour gets an `A<k>` row. The
second assumption here only limits scope, so it needs none.

---

# Web: the sign-in email field can lose an edit made while its action is pending

Issue: #55 · Runs on: `cloud` · Status: waiting for gate 1

## User story

As someone signing in on the web, I want an email I corrected while the "send code" request is still running to stay in the field when the request ends, so that I don't have to type it again.

## Acceptance criteria

1. Given I am on the email step and I submit an email
   When I edit the field while that request is still pending and the request then fails (for example an invalid email)
   Then the field still holds my edit and the error shows

2. Given I am on the email step and the request succeeds
   When I reach the code step
   Then the code step shows as it does today, with my email in its prompt

## Assumptions

- The first step is to reproduce the loss by holding the request open, as the #51 test does, because the issue says the cause is likely but not yet reproduced. If it does not reproduce, the PR says so and the test stays as a regression guard.
- Only the email step's field changes; the code step's field, the sign-in flow, codes, rate limits and the API stay as they are, as the issue's non-goals say.

## Test matrix

| AC  | Test                                                                                                                                       | Level   | Where                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------- |
| 1   | New test: hold the first sign-in Server Action open, edit the email, release a failure; the field holds the edit and the error shows       | web E2E | `apps/web/e2e/sign-in.spec.ts` (new; pattern: `#51 AC 1` in `groups.spec.ts`) |
| 2   | Existing `AC 2: a valid email asks the API for a code and shows the code step` still passes (code step shows with the email in its prompt) | web E2E | `apps/web/e2e/sign-in.spec.ts`                                                |

## Out of scope

- Any change to the sign-in flow, codes, rate limits or the API.
- Any change to the code step's field.
- Other forms, including the create-group form fixed in #51.
