# Spec shapes: wrong and right

Each pair is a shape the spec skill's rules ask for. The right one is from a real `pilot-app` spec,
or close to one, and the line under it says why it is right.

## A criterion with an outcome a test can check

Wrong:

```markdown
1. Given I am signed in
   When I add an expense
   Then it works correctly
```

Right:

```markdown
1. Given a group with members A and B
   When A adds an expense of 100000 VND split equally
   Then A's balance is +50000 and B's balance is -50000
```

A test can read both numbers. "Works correctly" gives the test nothing to assert.

## A `manual` row

Wrong:

```markdown
| 3 | Check it on the phone | manual | mobile |
```

Right (#109):

```markdown
| 3 | The iOS run is green on the runner with Automation permission still not granted, and the log has no `osascript` call | manual | Actions log in the PR (the permission state is machine-side) |
```

It says why no test tool can check it (the state lives on the machine) and what evidence the PR
carries instead (the log). `lint-spec.mjs` fails a manual row that names no evidence.

## An assumption that promises a behaviour

Wrong (#14): the assumption promises something, and the test matrix has no row for it.

```markdown
## Assumptions

- While a create is saving, the submit button is disabled, so a double tap doesn't create two groups.
```

Right: the same assumption, and a row with `A<k>`, `k` being its place in the list.

```markdown
| A1 | Two presses before the first save answers create one group | unit | `apps/web/src/app/groups/create-group-form.test.tsx` |
```

On #14 that promise had no row, and the review fix for it shipped with no test. An assumption
that only limits scope ("the API stays as it is") needs no row.

## A `|` inside a table cell

Wrong: the formatter splits the cell at the pipe, and the row gets one cell too many.

```markdown
| 2 | `grep -n "^| A5 " docs/specs/26.md` finds the row | manual | the PR |
```

Right (#49):

```markdown
| 2 | `grep -n "^\| A5 " docs/specs/26.md` finds the row | manual | the PR |
```

Inside a table, even inside a code span, a pipe is written `\|`. `lint-spec.mjs` counts the cells.

## An existing test

Wrong: no file, so nobody can check that it exists (#19 and #31 cited tests that didn't).

```markdown
| 5 | Existing E2E for the API-down page still pass | web E2E | apps/web |
```

Right (#55):

```markdown
| 2 | Existing `AC 2: a valid email asks the API for a code and shows the code step` still passes | web E2E | `apps/web/e2e/sign-in.spec.ts` |
```

The test's name is found with `rg -n "AC 2: a valid email" apps/web/e2e`, and the file is in the
row. `lint-spec.mjs` fails a row that calls a test existing and names no file that exists.

## A check that needs the merge first

Wrong (#109): a criterion the PR can't show, so `PR evidence` failed on its box three times.

```markdown
| 2 | Re-run #108's `mobile-e2e` job; both iOS and Android are green | manual | Actions run link in the PR (it needs the runner and another PR) |
```

Right:

```markdown
## After merge

- Re-run #108's `mobile-e2e` job: the owner, after the merge; both iOS and Android are green.
```

It names who runs it and what shows it passed, and it is not a criterion.
