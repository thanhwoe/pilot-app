"use client";

import { groupsCopy as copy, GROUP_NAME_MAX_LENGTH } from "@gop/shared";
import { useActionState } from "react";
import { type CreateGroupState, createGroupAction } from "./actions";

const initialState: CreateGroupState = {};

export function CreateGroupForm() {
  const [state, formAction, pending] = useActionState(createGroupAction, initialState);

  return (
    <form className="create-group" action={formAction}>
      <label htmlFor="group-name">{copy.nameLabel}</label>
      {/* Not `required`: an empty name must reach the action, which shows the error. */}
      <input id="group-name" name="name" type="text" maxLength={GROUP_NAME_MAX_LENGTH} />
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {copy.create}
      </button>
    </form>
  );
}
