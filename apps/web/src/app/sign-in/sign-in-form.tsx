"use client";

import { signInCopy as copy, type SignInState } from "@gop/shared";
import { useActionState } from "react";
import { ActionTextField } from "../action-text-field";
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
          {/* The keys guard a remount on a step change: `initial` is read once, so a reused field would keep the old text. The markup already differs, so no test fails without them. */}
          <ActionTextField
            key="email"
            id="email"
            name="email"
            type="text"
            inputMode="email"
            autoComplete="email"
            initial={state.email}
            required
          />
        </>
      ) : (
        <>
          <input type="hidden" name="email" value={state.email} />
          <p>{copy.codePrompt(state.email)}</p>
          <label htmlFor="code">Mã</label>
          <ActionTextField
            key="code"
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
