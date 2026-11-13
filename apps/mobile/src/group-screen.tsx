import {
  EXPENSE_DESCRIPTION_MAX_LENGTH,
  type Expense,
  expensesCopy,
  formatAmountInput,
  formatExpenseDate,
  formatVnd,
  type GroupDetailResponse,
  isSaveExpenseSignedOut,
  isScreenSignedOut,
  parseAmountInput,
  payerLine,
} from "@gop/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { loadMyGroupScreen, saveMyExpense } from "@/lib/expenses";
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
  const [adding, setAdding] = useState(false);
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
          {adding && myId ? (
            <ExpenseForm
              groupId={groupId}
              myId={myId}
              memberIds={screen.group.members.map((member) => member.userId)}
              onSaved={async () => {
                // No insert of our own: the list is what the API says after the save.
                await load();
                setAdding(false);
              }}
            />
          ) : (
            <Pressable testID="add-expense" style={styles.button} onPress={() => setAdding(true)}>
              <Text style={styles.buttonText}>{expensesCopy.add}</Text>
            </Pressable>
          )}
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

/** The amount and the description of a new expense, paid by me and split between the members. */
function ExpenseForm({
  groupId,
  myId,
  memberIds,
  onSaved,
}: {
  groupId: string;
  myId: string;
  memberIds: string[];
  onSaved: () => Promise<void>;
}) {
  const guard = useSessionGuard();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // `saving` disables the button only from the next render; this stops a second fast tap.
  const inFlight = useRef(false);

  async function save() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      const outcome = await guard(
        () =>
          saveMyExpense({
            groupId,
            myId,
            memberIds,
            amount: parseAmountInput(amount),
            description,
          }),
        isSaveExpenseSignedOut,
      );
      if (!outcome) {
        return;
      }
      if (!outcome.saved) {
        setError(outcome.error);
        return;
      }
      setError(null);
      await onSaved();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.label}>{expensesCopy.amountLabel}</Text>
      <TextInput
        testID="expense-amount-input"
        style={styles.input}
        value={amount}
        onChangeText={(text) => setAmount(formatAmountInput(text))}
        keyboardType="number-pad"
        editable={!saving}
        accessibilityLabel={expensesCopy.amountLabel}
      />
      <Text style={styles.label}>{expensesCopy.descriptionLabel}</Text>
      <TextInput
        testID="expense-description-input"
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        maxLength={EXPENSE_DESCRIPTION_MAX_LENGTH}
        editable={!saving}
        accessibilityLabel={expensesCopy.descriptionLabel}
      />
      {error && (
        <Text testID="expense-form-error" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <Pressable
        testID="save-expense"
        style={[styles.button, saving && styles.busy]}
        // `disabled` alone: on Android a `busy` state that returns to false keeps "busy" as the
        // button's accessibility text, hiding its label.
        disabled={saving}
        onPress={save}
      >
        <Text style={styles.buttonText}>{expensesCopy.save}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 12, padding: 24 },
  title: { fontSize: 24, fontWeight: "700" },
  error: { color: "#cf222e" },
  button: { alignSelf: "flex-start", backgroundColor: "#171717", borderRadius: 6, padding: 12 },
  buttonText: { color: "#fff", fontSize: 16 },
  busy: { opacity: 0.5 },
  form: { gap: 8 },
  label: { fontSize: 16 },
  input: { borderWidth: 1, borderRadius: 6, borderColor: "#888", padding: 10, fontSize: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6 },
  rowText: { flex: 1 },
  rowAmount: { alignItems: "flex-end" },
  description: { fontSize: 16 },
  muted: { fontSize: 14, opacity: 0.7 },
});
