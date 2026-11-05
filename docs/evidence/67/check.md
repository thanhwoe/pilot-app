# #67: the one-time-code field on a phone

Issue: #67 · Spec: [67.md](../../specs/67.md) · Plan: [67-plan.md](../../specs/67-plan.md) · Checked: 2026-11-05

**Result: no defect found, no code change.** On both platforms, a code that reached the field by a path other than typing signed in (criterion 1), and after a failed sign-in the field still held the code and the error showed (criterion 2). What was not proven is a suggestion built from a code the phone received through the app itself. See [What stays unproven](#what-stays-unproven).

The field under test is `ActionTextField` in `apps/web/src/app/action-text-field.tsx`, rendered as `<input id="code" inputMode="numeric" autoComplete="one-time-code">`. #72 replaced `CodeField` with it. Both runs used `next dev` on `localhost` (API on :3001 with `DEV_SIGN_IN_CODES=true`), a fresh `example.test` email per attempt, and the e2e lock held for the whole check.

## Summary

| Platform                              | Criterion 1: right code, "Đăng nhập" signs in   | Criterion 2: wrong code, error shows and the field keeps the code | How the code got into the field                                                                                                                                         |
| ------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android 15 emulator, Chrome 124       | **Pass**: signed in as `android-…@example.test` | **Pass**: error shown, field still `000000`                       | AC 1: pasted, after copying the code from the SMS notification. AC 2: tapped the keyboard's clipboard-code suggestion (Gboard), after copying a wrong code the same way |
| iPhone 16 Simulator, iOS 18.3, Safari | **Pass**: signed in as `ios-…@example.test`     | **Pass**: error shown, field still `000000`                       | **Typed** with Maestro's `inputText`. The Simulator could not paste (below)                                                                                             |

Typed input fires the normal `onChange` path, so the two iOS passes show that sign-in and the re-render behave on Safari. They do not show anything about autofill. That is a limit of the Simulator, not a result.

## Android: Pixel_9_API_35 (Android 15, with Google Play), Chrome 124.0.6367.219

The emulator is the same one `apps/mobile/e2e/run.sh` uses. Chrome was reached as `http://localhost:3000` through `adb reverse tcp:3000 tcp:3000`, so its origin is `localhost`, as on iOS.

**Criterion 1**

1. On the code step, `adb emu sms send 5551234 "283937 is your Gop code"` (283937 was the code the API had just issued for that email, read from `GET /dev/sign-in-code`). The Messages notification arrived with a copy-code chip: [android-ac1-sms-notification.png](android-ac1-sms-notification.png).
2. With the field focused, the keyboard offered **no** suggestion for the code: its strip held only the key, card and pin icons. [android-ac1-no-suggestion.png](android-ac1-no-suggestion.png).
3. The SMS was sent again and the notification's copy chip tapped. A long-press on the field then showed Chrome's "Paste" bubble. After tapping it the field held `283937` and Chrome said "pasted from your clipboard": [android-ac1-pasted.png](android-ac1-pasted.png).
4. "Đăng nhập" signed in and the home page showed the email and "Nhóm của tôi": [android-ac1-signed-in.png](android-ac1-signed-in.png).

**Criterion 2**

1. After signing out, a new email reached the code step. The API's code was `764596`, so `000000` was a wrong code. It was sent as an SMS and copied from the notification the same way.
2. This time the keyboard offered a clipboard-code suggestion, `000000`: [android-ac2-keyboard-suggestion.png](android-ac2-keyboard-suggestion.png). Tapping it filled the field: [android-ac2-filled.png](android-ac2-filled.png). That is a keyboard-inserted value, the closest thing in this check to a real suggestion.
3. "Đăng nhập" showed "Mã không đúng hoặc đã hết hạn…" and the field still held `000000`: [android-ac2-error-field-kept.png](android-ac2-error-field-kept.png).

## iOS: iPhone 16, iOS 18.3, Safari

Safari reached `http://localhost:3000/sign-in` and was driven with Maestro 2.12 (text taps for the email step, points for the code field and the button, because the page text is not always in the accessibility tree). The code step, with the numeric keypad and no code suggestion: [ios-ac1-code-step.png](ios-ac1-code-step.png).

**Why it was typed.** The plan was to put the code on the pasteboard with `xcrun simctl pbcopy` and paste it. That did not work on this machine (Xcode 27.1, which has no Simulator app, only headless devices): `simctl pbpaste` read back nothing after `pbcopy`, and in Safari the Paste / AutoFill menu appeared ([ios-paste-menu.png](ios-paste-menu.png)) but nothing was inserted: Maestro could not find a "Paste" text (the callout is not in its accessibility tree), and tapping the position where the button had been left the field empty. Several attempts (field focused first or not, by text and by position) gave the same result. The Simulator also cannot receive an SMS, so it never offers a code suggestion.

**Criterion 1.** The right code, typed, and "Đăng nhập": the home page showed the email and "Nhóm của tôi": [ios-ac1-signed-in.png](ios-ac1-signed-in.png).

**Criterion 2.** After signing out, a new email, the wrong code `000000` typed and "Đăng nhập": the error showed and the field still held `000000`: [ios-ac2-error-field-kept.png](ios-ac2-error-field-kept.png).

## What the scratch probe showed first

Before the devices, a throwaway Playwright probe (Chromium, Pixel 7 viewport, deleted afterwards, not proof for either criterion) filled the field four ways on the code step and then pressed "Đăng nhập" once with the right code and once with a wrong one. It used the browser's own `value` setter, so React's tracker was not updated.

| Way of filling                | Right code signs in | Wrong code: field after the error |
| ----------------------------- | ------------------- | --------------------------------- |
| value setter, then `input`    | yes                 | keeps the code                    |
| value setter, then `change`   | yes                 | keeps the code                    |
| value setter, no event at all | yes                 | **empty**                         |
| `fill()`                      | yes                 | keeps the code                    |

So a fill that skips `onChange` still submits, because the form reads the DOM, and loses the code on the next render. That is the failure the two devices could have shown. Neither did: on Android the value arrived through the keyboard and Chrome in ways that reach React.

## What stays unproven

- **A suggestion built from a code the phone received through the app.** The API does not deliver codes yet (`apps/api/src/auth/log-code-sender.ts` writes them to the API log), so no keyboard on any device can suggest one. The SMS here was sent by `adb emu sms send` with a code read from the dev endpoint. That is the nearest approximation, and it did not make the keyboard offer the code at criterion 1. It can only be checked once the API sends codes, so it belongs to the issue that adds delivery. This was the owner's decision on the plan's question: no pass on a real phone, and no `allowedDevOrigins` change.
- **iOS autofill of any kind.** Only typed input was used on iOS. Safari's QuickType suggestion and a paste were not exercised.
- **A real device,** with its own Chrome and keyboard versions, and **a production build** (the check ran against `next dev`).
