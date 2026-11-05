# Plan: Web: one shared controlled field for the text fields of action forms

Issue: #72 · Spec: [72.md](72.md) · Runs on: `cloud` · Status: waiting for gate 2

## Contracts

None. No schema, endpoint or migration changes, and no change to `packages/shared`, the API or mobile. The one new interface is internal to `apps/web`, the props of `ActionTextField`:

```tsx
type ActionTextFieldProps = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange"> & {
  /** The starting value, read once. */
  initial?: string;
  /** The action's latest result. A new object means the action ended. */
  result?: object;
  /** The value that result carries when the action succeeded. */
  submitted?: string;
};
```

It renders only `<input value={value} onChange=… {...rest} />`. `id`, `name`, `type`, `inputMode`, `autoComplete`, `maxLength` and `required` pass through. When `result` is a new object and `submitted` is set, the field clears only if it still holds `submitted`, as the create-group form does today (#54). Keying on the name alone would miss a second create with the same name, which the API allows.

## What the code does today

Read in full: `create-group-form.tsx`, `sign-in/sign-in-form.tsx`, `actions.ts` (the `CreateGroupState` type and `createGroupAction`), `e2e/groups.spec.ts`, `e2e/helpers.ts`, `REVIEW.md` and the "Action forms" rule in `CLAUDE.md`.

- **Create-group.** The form keeps `name` in `useState` and clears it in a `useEffect` keyed on `[state]`: `state.name` is set only on success, and the setter clears when `typed === submitted`. `state` is a new object for every action result, so two creates with the same name each clear the field today. `createGroupAction` returns `{ name }` with the name as submitted.
- **Sign-in.** `EmailField({ initial })` and `CodeField()` each keep their own `useState`. `EmailField` is rendered in the `email` branch of the ternary and `CodeField` inside the `code` branch's fragment, so they are different element types and remount when the step changes. That remount is why `initial={state.email}` refills the email after "Dùng email khác" and why a new code step starts empty (#55, #59, AC 5).
- **Readers.** `grep -rn "EmailField\|CodeField"` over the repo (without `node_modules`) finds them only in `sign-in-form.tsx` (lines 15, 40, 67, 72) and in the old plans `docs/specs/55-plan.md` and `59-plan.md`. `grep -rln "useState\|useEffect" apps/web/src` finds only the two forms. `grep -rn "useActionState" apps/web/src` finds only the two forms. `state.name` is read only in `create-group-form.tsx:18`. Nothing else uses these.
- **Tests.** The titles the spec names exist: `#51 AC 1`, `#54 AC 3, 4`, `#20 AC 3` in `groups.spec.ts`; `#55 AC 1`, `#59 AC 1`, `#59 AC 3` and `AC 5: 'use another email' goes back to the email step` in `sign-in.spec.ts`. The web package has unit tests only for `.ts` modules (no jsdom or Testing Library), so the e2e tests are the proof, as the spec says.
- **Open PRs.** `gh api repos/{owner}/{repo}/pulls` returns none, so nothing else touches these files.

## Files

| File                                        | Change                                                                                                                                                                                                     | AC            |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `apps/web/e2e/groups.spec.ts`               | New test `#72 AC 5`: create a group, then another with the same name; the field is empty after each. No existing test changes                                                                              | 5             |
| `apps/web/src/app/action-text-field.tsx`    | New client component `ActionTextField`, as in Contracts                                                                                                                                                    | 1, 2, 3, 4, 5 |
| `apps/web/src/app/create-group-form.tsx`    | Render `ActionTextField` with `result={state}` and `submitted={state.name}`; remove `useState`, `useEffect` and `onChange`. The `<label>`, `id`, `name`, `maxLength` and the "not `required`" comment stay | 1, 3, 5       |
| `apps/web/src/app/sign-in/sign-in-form.tsx` | Replace `EmailField` and `CodeField` with `ActionTextField` (`initial={state.email}` for the email, none for the code), each with a `key` so the step change still remounts it; remove `useState`          | 1, 2, 4       |
| `apps/web/src/app/actions.ts`               | One comment: `CreateGroupState.name` says "The form keeps its own copy of the field (#51)"; it now says `ActionTextField` does. No code change                                                             | plumbing      |

No change to `docs/specs/72.md`, `packages/shared`, the API, mobile or any existing test.

## Steps

1. `cloud` · AC 5 (and the baseline for AC 2, 3, 4) · **Test first**: add `#72 AC 5: two creates with the same name each clear the field` to `groups.spec.ts`, modelled on `#20 AC 3`: sign in, `createGroup(page, "Đà Lạt")`, wait for one list item, expect the field `toHaveValue("")`, `createGroup(page, "Đà Lạt")` again, wait for two items, expect the field empty. The spec says it passes on today's code, so run `pnpm db:up` and then `pnpm --filter @gop/web test:e2e` before any change: the whole suite, new test included, must pass. That run is the baseline for the "unchanged" criteria · done when the suite passes before the change. Commit `test(web): ... (#72)`
2. `cloud` · AC 1, 2, 3, 5 · Create `action-text-field.tsx` and move the create-group form onto it (the effect keeps its timing: it runs after the commit, as today, so the `requestAnimationFrame` wait in `#54 AC 3, 4` still orders the check). Update the comment in `actions.ts`. **Mutation check, not committed:** key the effect on `submitted` alone (leave `result` out of its dependencies); `#72 AC 5` must fail on the second create (the name did not change, so the field is not cleared). Put it back · done when `pnpm --filter @gop/web test:e2e` passes (existing tests unchanged, `#72 AC 5` included), the mutation check failed as stated, and `pnpm lint` and `pnpm typecheck` pass. Commit `refactor(web): ... (#72)`
3. `cloud` · AC 1, 2, 4 · Move the sign-in form onto `ActionTextField`. Give the email field `key="email"` and the code field `key="code"`: without keys, the two branches would put an `ActionTextField` at the same position, React would reuse it, `initial` (read once) would not refill the email and the code would keep the old text. **Check it:** drop the keys for one run; `AC 5: 'use another email'…` or `#59` must fail, then put them back · done when `pnpm --filter @gop/web test:e2e` passes unchanged and `pnpm lint` and `pnpm typecheck` pass. Commit `refactor(web): ... (#72)`
4. `cloud` · AC 1 evidence · No code. Run `grep -n "useState\|useEffect\|onChange" apps/web/src/app/create-group-form.tsx apps/web/src/app/sign-in/sign-in-form.tsx` (expect no output) and `grep -rn "ActionTextField" apps/web/src` (expect the component and three uses). Then `pnpm lint`, `pnpm typecheck` and `pnpm test`, each on its own with its exit status read · done when all three pass and both searches give the expected output. The PR carries the two search results as AC 1's evidence

## Verification

- `pnpm db:up`, then `pnpm --filter @gop/web test:e2e` (Playwright, Chromium; needs `pnpm --filter @gop/web exec playwright install chromium` once). It runs through `scripts/e2e-lock.sh`, so it waits for any other end-to-end run on the machine. If the cloud session can't reach the browser, CI's `e2e` job is the evidence.
- `pnpm lint && pnpm typecheck && pnpm test`.
- No `verify` for the API or mobile: they don't change. `verify` web adds nothing the Playwright run doesn't prove, since no screen changes. No screenshots: no visible change, which the non-goals require.

## Risks

- **Remount on a step change (the real risk).** The sign-in form relies on React remounting the field when the step changes. A shared component rendered at the same position in both branches would be reused and break "Dùng email khác" and the empty code field. Step 3 gives each field a `key` and proves with a run that the tests fail without it.
- **Timing of the clear.** `#54` depends on the clear happening in an effect after the commit. Step 2 keeps an effect, with the same trigger (a new result), so the tests that wait one frame still apply.
- **An unrelated edit to the "Action forms" rule.** `CLAUDE.md` and `REVIEW.md` say a field in a `useActionState` form is controlled, but not that `ActionTextField` is the way to do it. The spec rules out a new rule, so I left both alone. **Question for the author:** add one sentence to the "Action forms" rule pointing at `ActionTextField`, so the next action form uses it? It would be a small docs-only commit.
- **Fields outside the three.** The hidden inputs in the sign-in form are not text fields the member types in, and stay as they are.
- **Rollback:** revert the commits. No data, API or contract is touched.
