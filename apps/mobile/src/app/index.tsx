import type { HealthResponse } from "@gop/shared";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { apiUrl, fetchHealth } from "@/lib/api";

type State = { kind: "loading" } | { kind: "ok"; health: HealthResponse } | { kind: "error" };

export default function Home() {
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
});
