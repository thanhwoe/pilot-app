# Plan shapes: wrong and right

Each pair is a shape the plan skill's rules ask for, from real `pilot-app` plans where one exists.
The line under each says why the right one is right.

## A step

Wrong: no tag, no criteria, no test first, nothing to show it is done.

```markdown
3. Update the invite screen so joining opens the group.
```

Right (#55, step 2):

```markdown
2. `cloud` · AC 1, 2 · Add `EmailField` to `sign-in-form.tsx`: a controlled input with its own `useState(state.email ?? "")`, used only on the email step · done when `pnpm --filter @gop/web test:e2e e2e/sign-in.spec.ts` passes, including the new test and the existing `AC 2`, `AC 5`, `AC 6` and `AC 7`
```

Tag, criteria, the change, and a command that proves it. `lint-spec.mjs` fails a step with no tag
or no "done when", and a criterion that is in no step.

## A step that removes or renames something

Wrong (#51, step 2): nothing says who else reads `name`.

```markdown
... remove the unused `name` from `CreateGroupState` and the failure return in `actions.ts` ...
```

Right (illustrative):

```markdown
... remove the unused `name` from `CreateGroupState`: `grep -rn "\.name\b" apps/web/src apps/web/e2e` finds only `create-group-form.tsx` and `groups.spec.ts` AC 15, which this step updates ...
```

Tests count as readers, so the search covers them, and the step says what it found.
`lint-spec.mjs` fails a step that removes or renames a named thing with no search in it.

## A step that adds to output a test compares whole

Wrong: "existing tests unchanged", with no search behind it (#94 and #95 broke a whole-row match).

Right (illustrative):

```markdown
... adds the member count to each row: `grep -rn 'listitem' apps/web/e2e` finds the row-text match in `groups.spec.ts` AC 13, which this step updates ...
```

It names each assertion the step must change, so nobody learns of it from a red CI run.

## A check that must fail

Wrong (#72): a mutation check whose failure depends on markup the step hasn't written yet, put in
"done when", so the step can't finish when the guess is wrong.

Right (#107):

```markdown
... (a), (d) and (e) may pass on the code of step 1, because the existing retry already reloads and the guard already handles 401 on any load; they pin the changed retry path. (b) fails on the step 1 code, which blanks the screen during a retry. For (c), if it doesn't fail with the `retrying` guard removed, keep the guard and say why under **Differs from the plan**.
```

It says which tests fail first and why, from the code the step leaves, which may not and why, and
what to do if one doesn't, outside "done when".

## A test that a spy is not called

Wrong (#112, step 3): the 401 ends the session, and the same screen then calls
`replace("/sign-in")`, so this fails in the build.

```markdown
Change the existing `a 401 on the join deletes the token` test's last assertion to `expect(replace).not.toHaveBeenCalled()`.
```

Right:

```markdown
Keep `expect(replace).not.toHaveBeenCalledWith("/")` and add `expect(replace).not.toHaveBeenCalledWith(groupHref)`: `grep -n 'replace(' invite-screen.tsx` finds the signed-out effect's `replace("/sign-in")`, which a 401 reaches.
```

It names the search and the other call it found, and asserts only the call the test is about.

## A risk to what the user can do today

Wrong (#112): the plan names an option that keeps Back working, takes the other one, and asks.

```markdown
The alternative is to open the list first and then the group (`replace("/")`, then `push`), so Back always works, at the cost of a second navigation. The plan follows the issue and uses one `replace`. Question for the author: is that acceptable?
```

Right:

```markdown
**Back after joining.** One `replace` would leave nothing under the group screen after sign-in or a cold start, so Back would leave the app. The plan opens the list first and then pushes the group (`replace("/")`, then `push`), so Back always lands on the list. The cost is a second navigation, which step 4's flows check.
```

It keeps what works today and says the cost. A question is only for a risk no option avoids.

## A question for the author

Wrong: a question the build can't act on when `plan-ok` comes with no answer.

```markdown
- Question for the author: should Back from the group screen go to the groups list?
```

Right (illustrative, from #112's question 2):

```markdown
- Question for the author: should Back from the group screen always land on the groups list,
  also after a cold start and after sign-in? **Default:** yes, with `replace("/")` then `push`.
```

A triggered build takes the default and lists it under **Differs from the plan** (ADR-010).

## A `mac` step's test first

Wrong (#112, step 4): a fail-first Maestro run on the old code, which needs another Release build
per platform.

Right (#112, after the owner's answer): the unit tests of steps 1 and 2 fail first for the same
reason, and step 4 runs the Maestro flows once on the finished code, iOS then Android.

Ask for a fail-first flow only when no unit test can fail for the same reason, and say why.
