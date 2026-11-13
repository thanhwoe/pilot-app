# Review checklist

Reviewers, human or Claude, check each item and cite file and line for every problem.

## Correctness

- [ ] Every acceptance criterion in `docs/specs/<N>.md` has a test that would fail without the change.
- [ ] Money is whole VND integers end to end. No floats, no `Number` parsing of user input without validation.
- [ ] Splits add up exactly to the expense amount. The rounding rule from the spec is applied and tested.
- [ ] Database writes that must happen together run in one transaction.

## Contracts

- [ ] New or changed request and response bodies have a Zod schema in `packages/shared`.
- [ ] The API, web and mobile all use that schema; there are no hand-written duplicate types.
- [ ] Breaking API changes update both clients in the same PR.

## Security

- [ ] Every route that reads or writes group data checks that the caller is a member of that group.
- [ ] No secrets, tokens or real personal data in code, fixtures, logs or screenshots.
- [ ] User input is validated with Zod at the API boundary.

## Quality

- [ ] Domain logic lives in `packages/shared`, not in handlers or components.
- [ ] No dead code, commented-out code or leftover `console.log`.
- [ ] Mobile UI has `testID`s on the elements the Maestro flow uses.
- [ ] A test that proves a criterion of another issue's spec names that issue in its title (`#19 AC 1`), so "AC 3" is never ambiguous.
- [ ] A test that asserts something stayed the same first waits for the event that would have changed it (a frame, a response, a rendered row), so it can't pass before the change had its chance.
- [ ] A field in a `useActionState` form is controlled (a text field through `ActionTextField`), and a test holds the action open (`holdFirstServerAction`) and types before it ends.
- [ ] A screen that saves and then reloads has a test for a save the API accepts followed by a reload that fails: it keeps what it showed, offers a retry of the reload, and does not offer the same save again (#97, #107).
- [ ] A screen opened by a link or a route parameter has a test for a second value arriving while it is open (it replaces what the first one showed) and for a malformed value arriving after a good one (it clears what was remembered) (#98).
- [ ] Docs and `CLAUDE.md` are updated when behaviour or commands changed.

## Evidence

- [ ] CI is green.
- [ ] UI changes have screenshots: web, and iOS and Android when mobile changed.
