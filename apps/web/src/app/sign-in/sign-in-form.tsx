"use client";

import { useActionState } from "react";
import { copy } from "@/lib/copy";
import type { SignInState } from "@/lib/sign-in-flow";
import { signInAction } from "./actions";

const initialState: SignInState = { step: "email" };

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form className="sign-in" action={formAction}>
      <input type="hidden" name="step" value={state.step} />
      {state.step === "email" ? (
        <>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="text"
            inputMode="email"
            autoComplete="email"
            defaultValue={state.email}
            required
          />
        </>
      ) : (
        <>
          <input type="hidden" name="email" value={state.email} />
          <p>{copy.codePrompt(state.email)}</p>
          <label htmlFor="code">Mã</label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
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
