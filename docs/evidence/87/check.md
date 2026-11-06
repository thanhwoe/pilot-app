# Evidence for #87: the email code check on a real phone

Checked on 2026-11-06, by the owner, on the Mac mini and one iPhone. The Android half (AC 7) was not run.

## Setup

- API: `pnpm --filter @gop/api start`, with `RESEND_API_KEY` set in the git-ignored `apps/api/.env`. Sender `Góp <onboarding@resend.dev>`.
- Web: `ALLOWED_DEV_ORIGINS=<the Mac's LAN address> pnpm --filter @gop/web dev -H 0.0.0.0`.
- The phone opened `http://<the Mac's LAN address>:3000/sign-in` over the local network. **Transport: plain `http://`.** HTTPS was not needed, because iOS offered the code.
- Revoking the key in Resend is the owner's last step; it is not recorded here.

## AC 6: iPhone

| | |
| --- | --- |
| Device | iPhone 14 Pro Max |
| OS | iOS 27.0.1 |
| Browser | Safari |
| Mail app | Gmail (not Apple Mail, which the plan assumed) |
| Transport | `http://` on the LAN |
| Email sent | Subject `Mã đăng nhập Góp của bạn`, body with the Vietnamese line, the English line `Your Góp sign-in code is:`, the code on its own line, and the 10-minute line, as approved at gate 2 |

What happened:

- The email reached Gmail from `Góp` with the approved wording: [ios-gmail-email.png](ios-gmail-email.png).
- On the code step, the keyboard bar offered the code with the source `Từ Gmail`, next to a Gmail banner that held the same email: [ios-code-suggestion.png](ios-code-suggestion.png). So iOS recognises the code from the Vietnamese-and-English text, from Gmail, over plain `http://`.
- The API log shows a sign-in right after a code request: `POST /auth/code` answered `204` at 09:29:00, and `POST /auth/sign-in` at 09:29:06 was followed by `GET /me`. That is 6 seconds, which fits tapping the suggestion.
- **Not captured:** screenshots of the filled field and of the signed-in page. The sign-in itself is shown only by the log above. The suggestion screenshot is of a second code, requested after signing out, and that code was not submitted.
- The API log holds no sign-in code and no key. `grep` for the codes and for a 6-digit `"code"` field found nothing.

## AC 4 on a real device

With an address that does not own the key, Resend answered `403` (the `resend.dev` limit). The API logged `the provider answered 403` with the status number only and answered a generic `500`. The web showed the "unavailable" text (`Không kết nối được máy chủ. Hãy thử lại.`). The screenshot is not kept, because it showed another person's address. With the key owner's address, the same request answered `204`.

## AC 7: Android

**Not run.** The owner skipped it. It stays unproven. The check is carried by #90.
