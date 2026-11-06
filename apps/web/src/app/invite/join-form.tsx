"use client";

import { invitesCopy as copy } from "@gop/shared";
import { useActionState } from "react";
import { type JoinGroupState, joinGroupAction } from "./actions";

const initialState: JoinGroupState = {};

/** The join button. The token is a hidden field, so the action reads it from the form. */
export function JoinForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(joinGroupAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {copy.join}
      </button>
    </form>
  );
}
