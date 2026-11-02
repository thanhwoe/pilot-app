import { groupsCopy as copy, loadGroups } from "@gop/shared";
import { cookies } from "next/headers";
import { groupsApi } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { CreateGroupForm } from "./create-group-form";

/** Server component: my groups from `GET /groups` on every request, and the create form. */
export async function Groups() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    // The proxy sends visitors without a session to sign-in; nothing to list.
    return null;
  }
  const state = await loadGroups(groupsApi(), token);

  return (
    <section className="groups" aria-labelledby="groups-heading">
      <h2 id="groups-heading">{copy.heading}</h2>
      <CreateGroupForm />
      {state.kind === "unavailable" ? (
        <p className="form-error">{copy.unavailable}</p>
      ) : state.groups.length === 0 ? (
        <p>{copy.empty}</p>
      ) : (
        <ul className="group-list" aria-labelledby="groups-heading">
          {state.groups.map((group) => (
            <li key={group.id}>
              <span className="group-name">{group.name}</span>{" "}
              <span className="group-members">{copy.memberCount(group.memberCount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
