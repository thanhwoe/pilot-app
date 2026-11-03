import {
  signInCopy as copy,
  GROUP_NAME_MAX_LENGTH,
  type GroupsState,
  groupsCopy,
  type HealthResponse,
} from "@gop/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { apiUrl, fetchHealth } from "@/lib/api";
import { createMyGroup, loadMyGroups } from "@/lib/groups";
import { useSession } from "@/lib/session";

type State = { kind: "loading" } | { kind: "ok"; health: HealthResponse } | { kind: "error" };

export default function Home() {
  const { state: session, signOut } = useSession();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetchHealth()
      .then((health) => setState({ kind: "ok", health }))
      .catch(() => setState({ kind: "error" }));
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Góp</Text>
      <Text>Chia tiền nhóm, biết ai nợ ai.</Text>
      {session.kind === "signed-in" ? (
        <Text testID="signed-in-email">{copy.signedInAs(session.email)}</Text>
      ) : (
        // The API was down at start: keep the session; sign-out still works without the API.
        <Text testID="account-error" style={styles.error}>
          {copy.unavailable}
        </Text>
      )}
      <Pressable
        testID="sign-out"
        style={[styles.button, signingOut && styles.busy]}
        disabled={signingOut}
        accessibilityState={{ busy: signingOut, disabled: signingOut }}
        onPress={() => {
          // With the API down this waits for the timeout; one tap is enough.
          setSigningOut(true);
          signOut();
        }}
      >
        <Text style={styles.buttonText}>{copy.signOut}</Text>
      </Pressable>
      <Groups />
      <Text testID="api-status" style={styles.status}>
        {state.kind === "loading" && "Đang kiểm tra API…"}
        {state.kind === "ok" && `API: ${state.health.status} · DB: ${state.health.db}`}
        {state.kind === "error" && `API: không kết nối được (${apiUrl})`}
      </Text>
    </ScrollView>
  );
}

/** My groups, newest first, and the form to create one. */
function Groups() {
  const { expire } = useSession();
  const [groups, setGroups] = useState<GroupsState | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // `creating` disables the button only from the next render; this stops a second fast tap.
  const inFlight = useRef(false);
  // A request still pending when this screen goes away (say, the user signed out) must not expire
  // the session: by the time it answers, the stored token may belong to a new sign-in.
  const mounted = useRef(true);

  async function expireIfShown() {
    if (mounted.current) {
      await expire();
    }
  }

  // `retrying` ignores a second press of "Thử lại" before the next render hides the button.
  const retrying = useRef(false);

  /** Asks for the list and shows the answer. */
  const load = useCallback(async () => {
    const state = await loadMyGroups();
    if (!mounted.current) {
      return;
    }
    // The API rejected the session: sign-in replaces this screen.
    if (state.kind === "signed-out") {
      expire();
      return;
    }
    setGroups(state);
  }, [expire]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  async function retry() {
    if (retrying.current) {
      return;
    }
    retrying.current = true;
    // Back to the loading line until the request answers.
    setGroups(null);
    try {
      await load();
    } finally {
      retrying.current = false;
    }
  }

  async function create() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setCreating(true);
    try {
      const outcome = await createMyGroup(name);
      if (!outcome.created) {
        if ("signedOut" in outcome) {
          await expireIfShown();
          return;
        }
        setError(outcome.error);
        return;
      }
      setError(null);
      setName("");
      if (groups?.kind === "loaded") {
        // The new group is the newest, so it goes first, as the API lists it.
        setGroups({ kind: "loaded", groups: [outcome.group, ...groups.groups] });
      } else {
        // The first load failed: ask again rather than show the new group as the only one.
        const state = await loadMyGroups();
        if (state.kind === "signed-out") {
          await expireIfShown();
          return;
        }
        setGroups(state);
      }
    } finally {
      inFlight.current = false;
      setCreating(false);
    }
  }

  return (
    <View style={styles.groups}>
      <Text testID="groups-heading" style={styles.heading} accessibilityRole="header">
        {groupsCopy.heading}
      </Text>
      <Text style={styles.label}>{groupsCopy.nameLabel}</Text>
      <TextInput
        testID="group-name-input"
        style={styles.input}
        value={name}
        onChangeText={setName}
        maxLength={GROUP_NAME_MAX_LENGTH}
        editable={!creating}
        accessibilityLabel={groupsCopy.nameLabel}
      />
      {error && (
        <Text testID="group-form-error" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <Pressable
        testID="create-group"
        style={[styles.button, creating && styles.busy]}
        // `disabled` alone: on Android a `busy` state that returns to false keeps "busy" as the
        // button's accessibility text, hiding its label.
        disabled={creating}
        onPress={create}
      >
        <Text style={styles.buttonText}>{groupsCopy.create}</Text>
      </Pressable>
      {groups === null && <Text testID="groups-loading">{groupsCopy.loading}</Text>}
      {groups?.kind === "unavailable" && (
        <>
          <Text testID="groups-error" style={styles.error}>
            {groupsCopy.unavailable}
          </Text>
          <Pressable testID="groups-retry" style={styles.button} onPress={retry}>
            <Text style={styles.buttonText}>{groupsCopy.retry}</Text>
          </Pressable>
        </>
      )}
      {groups?.kind === "loaded" && groups.groups.length === 0 && (
        <Text testID="groups-empty">{groupsCopy.empty}</Text>
      )}
      {groups?.kind === "loaded" &&
        groups.groups.map((group) => (
          <View key={group.id} style={styles.group}>
            <Text testID="group-name" style={styles.groupName}>
              {group.name}
            </Text>
            <Text testID="group-member-count" style={styles.members}>
              {groupsCopy.memberCount(group.memberCount)}
            </Text>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 12, padding: 24, justifyContent: "center" },
  title: { fontSize: 32, fontWeight: "700" },
  status: { fontFamily: "Menlo" },
  error: { color: "#cf222e" },
  button: { alignSelf: "flex-start", backgroundColor: "#171717", borderRadius: 6, padding: 12 },
  buttonText: { color: "#fff", fontSize: 16 },
  busy: { opacity: 0.5 },
  groups: { gap: 8, marginTop: 12 },
  heading: { fontSize: 20, fontWeight: "600" },
  label: { fontSize: 16 },
  input: { borderWidth: 1, borderRadius: 6, borderColor: "#888", padding: 10, fontSize: 16 },
  group: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  groupName: { fontSize: 16 },
  members: { fontSize: 16, opacity: 0.7 },
});
