"use client";

import { groupsCopy as copy, GROUP_NAME_MAX_LENGTH } from "@gop/shared";
import { useActionState, useEffect, useState } from "react";
import { type CreateGroupState, createGroupAction } from "./actions";

const initialState: CreateGroupState = {};

export function CreateGroupForm() {
  const [state, formAction, pending] = useActionState(createGroupAction, initialState);
  // Controlled, because React resets an uncontrolled field when an action ends, and that reset
  // would put the old value back over a name typed while the create was still pending (#51).
  const [name, setName] = useState("");

  // A create that succeeds clears the field; one that fails leaves what is typed, for a retry.
  useEffect(() => {
    if (state !== initialState && state.error === undefined) {
      setName("");
    }
  }, [state]);

  return (
    <form className="create-group" action={formAction}>
      <label htmlFor="group-name">{copy.nameLabel}</label>
      {/* Not `required`: an empty name must reach the action, which shows the error. */}
      <input
        id="group-name"
        name="name"
        type="text"
        maxLength={GROUP_NAME_MAX_LENGTH}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
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
