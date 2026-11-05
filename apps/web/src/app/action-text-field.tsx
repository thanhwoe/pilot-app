"use client";

import { type ComponentProps, useEffect, useState } from "react";

type ActionTextFieldProps = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange"> & {
  /** The starting value, read once. */
  initial?: string;
  /** The action's latest result. A new object means the action ended. */
  result?: object;
  /** The value that `result` carries when the action succeeded. */
  submitted?: string;
};

/**
 * The `<input>` of a text field in a form that uses `useActionState`. It is controlled, because
 * React resets an uncontrolled field when an action ends, and that reset puts the old value back
 * over text typed while the action was pending (#51, #55, #59). A failed action leaves what is
 * typed. A successful one, which gives a new `result` that carries `submitted`, clears the field
 * only if it still holds `submitted` (#54). The caller renders the `<label>`.
 */
export function ActionTextField({ initial, result, submitted, ...input }: ActionTextFieldProps) {
  const [value, setValue] = useState(initial ?? "");

  // Runs for every new `result`, not only when `submitted` changes: two creates with the same name
  // carry the same string, and each must clear the field (#72).
  useEffect(() => {
    if (result !== undefined && submitted !== undefined) {
      setValue((typed) => (typed === submitted ? "" : typed));
    }
  }, [result, submitted]);

  return <input {...input} value={value} onChange={(event) => setValue(event.target.value)} />;
}
