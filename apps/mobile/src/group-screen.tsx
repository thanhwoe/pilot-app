import {
  type Expense,
  expensesCopy,
  formatExpenseDate,
  formatVnd,
  type GroupDetailResponse,
  isScreenSignedOut,
  payerLine,
} from "@gop/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { loadMyGroupScreen } from "@/lib/expenses";
import { useSession } from "@/lib/session";
import { useSessionGuard } from "@/lib/session-guard";

type Screen =
  | { kind: "loaded"; group: GroupDetailResponse; expenses: Expense[] }
  | { kind: "unavailable" };

/** A group's screen: its name, its expenses newest first, and the way to add one. */
export function GroupScreen({ groupId }: { groupId: string }) {
  const { state: session } = useSession();
  const guard = useSessionGuard();
  const [screen, setScreen] = useState<Screen | null>(null);
  // `retrying` ignores a second press of "Thử lại" before the next render hides the button.
  const retrying = useRef(false);
  // Counts the loads, so only the answer to the one that started last is shown.
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const thisLoad = ++latestLoad.current;
    const answer = await guard(() => loadMyGroupScreen(groupId), isScreenSignedOut);
    if (answer && thisLoad === latestLoad.current) {
      setScreen(answer);
    }
  }, [guard, groupId]);

  useEffect(() => {
    load();
  }, [load]);

  async function retry() {
    if (retrying.current) {
      return;
    }
    retrying.current = true;
    // Back to the loading line until the request answers.
    setScreen(null);
    try {
      await load();
    } finally {
      retrying.current = false;
    }
  }

  const myId = session.kind === "signed-in" ? session.userId : null;
  // The device's offset from UTC; `getTimezoneOffset` counts the other way.
  const utcOffsetMinutes = -new Date().getTimezoneOffset();

  return (
    <ScrollView
      testID="group-screen"
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {screen?.kind === "loaded" && (
        <Text testID="group-title" style={styles.title} accessibilityRole="header">
          {screen.group.name}
        </Text>
      )}
      {screen === null && <Text testID="expenses-loading">{expensesCopy.loading}</Text>}
      {screen?.kind === "unavailable" && (
        <>
          <Text testID="group-screen-error" style={styles.error}>
            {expensesCopy.unavailable}
          </Text>
          <Pressable testID="group-screen-retry" style={styles.button} onPress={retry}>
            <Text style={styles.buttonText}>{expensesCopy.retry}</Text>
          </Pressable>
        </>
      )}
      {screen?.kind === "loaded" && (
        <>
          <Pressable testID="add-expense" style={styles.button}>
            <Text style={styles.buttonText}>{expensesCopy.add}</Text>
          </Pressable>
          {screen.expenses.length === 0 && (
            <Text testID="expenses-empty">{expensesCopy.empty}</Text>
          )}
          {screen.expenses.map((expense) => (
            <View key={expense.id} testID="expense-row" style={styles.row}>
              <View style={styles.rowText}>
                <Text testID="expense-description" style={styles.description}>
                  {expense.description}
                </Text>
                <Text testID="expense-payer" style={styles.muted}>
                  {myId ? payerLine(expense.payerId, myId, screen.group.members) : ""}
                </Text>
              </View>
              <View style={styles.rowAmount}>
                <Text testID="expense-amount" style={styles.description}>
                  {formatVnd(expense.amount)}
                </Text>
                <Text testID="expense-date" style={styles.muted}>
                  {formatExpenseDate(expense.createdAt, utcOffsetMinutes)}
                </Text>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 12, padding: 24 },
  title: { fontSize: 24, fontWeight: "700" },
  error: { color: "#cf222e" },
  button: { alignSelf: "flex-start", backgroundColor: "#171717", borderRadius: 6, padding: 12 },
  buttonText: { color: "#fff", fontSize: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6 },
  rowText: { flex: 1 },
  rowAmount: { alignItems: "flex-end" },
  description: { fontSize: 16 },
  muted: { fontSize: 14, opacity: 0.7 },
});
