"use client";

import { signInCopy as copy, type SignInState } from "@gop/shared";
import { useActionState, useState } from "react";
import { signInAction } from "./actions";

const initialState: SignInState = { step: "email" };

/**
 * The email step's field. It is controlled, because React resets an uncontrolled field when an
 * action ends, and that reset would put the old email back over one corrected while the request
 * was pending (#55). It starts from the email the step is given, so coming back from the code step
 * still fills it in, and a failed request leaves exactly what was typed.
 */
function EmailField({ initial }: { initial: string | undefined }) {
  const [email, setEmail] = useState(initial ?? "");

  return (
    <>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="text"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
    </>
  );
}

/**
 * The code step's field. It is controlled for the same reason as the email field: React resets an
 * uncontrolled field when an action ends, which emptied it over a code typed while the request was
 * pending (#59). A failed request leaves what is typed, so a short or wrong code can be fixed.
 */
function CodeField() {
  const [code, setCode] = useState("");

  return (
    <>
      <label htmlFor="code">Mã</label>
      <input
        id="code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        required
      />
    </>
  );
}

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form className="sign-in" action={formAction}>
      <input type="hidden" name="step" value={state.step} />
      {state.step === "email" ? (
        <EmailField initial={state.email} />
      ) : (
        <>
          <input type="hidden" name="email" value={state.email} />
          <p>{copy.codePrompt(state.email)}</p>
          <CodeField />
        </>
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {state.step === "email" ? copy.sendCode : copy.signIn}
      </button>
      {state.step === "code" && (
        <button
          type="submit"
          className="link-button"
          name="intent"
          value="change-email"
          formNoValidate
          disabled={pending}
        >
          {copy.useAnotherEmail}
        </button>
      )}
    </form>
  );
}
