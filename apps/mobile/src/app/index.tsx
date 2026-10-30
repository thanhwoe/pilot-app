import { signInCopy as copy, type HealthResponse } from "@gop/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { apiUrl, fetchHealth } from "@/lib/api";
import { useSession } from "@/lib/session";

type State = { kind: "loading" } | { kind: "ok"; health: HealthResponse } | { kind: "error" };

export default function Home() {
  const { state: session, signOut } = useSession();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    fetchHealth()
      .then((health) => setState({ kind: "ok", health }))
      .catch(() => setState({ kind: "error" }));
  }, []);

  return (
    <View style={styles.container}>
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
      <Pressable testID="sign-out" style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>{copy.signOut}</Text>
      </Pressable>
      <Text testID="api-status" style={styles.status}>
        {state.kind === "loading" && "Đang kiểm tra API…"}
        {state.kind === "ok" && `API: ${state.health.status} · DB: ${state.health.db}`}
        {state.kind === "error" && `API: không kết nối được (${apiUrl})`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 12, padding: 24, justifyContent: "center" },
  title: { fontSize: 32, fontWeight: "700" },
  status: { fontFamily: "Menlo" },
  error: { color: "#cf222e" },
  button: { alignSelf: "flex-start", backgroundColor: "#171717", borderRadius: 6, padding: 12 },
  buttonText: { color: "#fff", fontSize: 16 },
});
