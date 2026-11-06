"use client";

import { invitesCopy as copy } from "@gop/shared";
import { useActionState, useId, useState } from "react";
import { type CreateInviteState, createInviteAction } from "./invite/actions";

const initialState: CreateInviteState = {};

/**
 * One group's invite controls. A group that already has a link says so on the button, because
 * pressing it ends the old link. The new link is shown once, here: the API keeps only its hash,
 * so a reload shows the button again and no link.
 */
export function InviteButton({ groupId, hasInvite }: { groupId: string; hasInvite: boolean }) {
  const [state, formAction, pending] = useActionState(createInviteAction, initialState);

  return (
    <div className="invite">
      <form action={formAction}>
        <input type="hidden" name="groupId" value={groupId} />
        <button type="submit" disabled={pending}>
          {hasInvite || state.token ? copy.newLink : copy.invite}
        </button>
      </form>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.token && <InviteLink key={state.token} token={state.token} />}
    </div>
  );
}

/** The link to share. It is built here from this site's address, so no server setting is needed. */
function InviteLink({ token }: { token: string }) {
  const fieldId = useId();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/invite/${token}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // No clipboard here (plain HTTP away from localhost): the field stays selectable.
      (document.getElementById(fieldId) as HTMLInputElement | null)?.select();
    }
  }

  return (
    <div className="invite-link">
      <label htmlFor={fieldId}>{copy.linkLabel}</label>
      <input
        id={fieldId}
        type="text"
        readOnly
        value={link}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button type="button" onClick={copyLink}>
        {copied ? copy.copied : copy.copy}
      </button>
      <p>{copy.shownOnce}</p>
    </div>
  );
}
