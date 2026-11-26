import {
  type BalancesState,
  balanceRows,
  balancesCopy,
  EXPENSE_DESCRIPTION_MAX_LENGTH,
  type Expense,
  expensesCopy,
  formatAmountInput,
  formatExpenseDate,
  formatVnd,
  type GroupDetailResponse,
  isBalancesSignedOut,
  isRecordSettlementSignedOut,
  isSaveExpenseSignedOut,
  isScreenSignedOut,
  parseAmountInput,
  payerLine,
  paymentLines,
  settlementsCopy,
} from "@gop/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { loadMyBalances, loadMyGroupScreen, recordMyPayment, saveMyExpense } from "@/lib/expenses";
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
  // `failed`: a reload after a save did not work, so the rows shown may lack what was just saved.
  // `running`: the retry of that reload. The add button stays away in both, so the expense that
  // is stored but not shown is not added a second time by hand.
  const [reload, setReload] = useState<"idle" | "failed" | "running">("idle");
  // What the screen shows now, for `load` to read without being a dependency.
  const shown = useRef<Screen | null>(null);
  const [adding, setAdding] = useState(false);
  // `retrying` ignores a second press of "Thử lại" before the next render hides the button.
  const retrying = useRef(false);
  // Counts the loads, so only the answer to the one that started last is shown.
  const latestLoad = useRef(0);
  // The balances have their own state and load: a failure of one part must not hide the other
  // (#134). `null` is the loading line, and no figures are kept while loading or after a failure.
  const [balances, setBalances] = useState<BalancesState | null>(null);
  const retryingBalances = useRef(false);
  const latestBalancesLoad = useRef(0);

  const loadBalancesNow = useCallback(async () => {
    const thisLoad = ++latestBalancesLoad.current;
    setBalances(null);
    const answer = await guard(() => loadMyBalances(groupId), isBalancesSignedOut);
    if (!answer || thisLoad !== latestBalancesLoad.current) {
      return;
    }
    setBalances(answer);
  }, [guard, groupId]);

  const load = useCallback(async () => {
    const thisLoad = ++latestLoad.current;
    const answer = await guard(() => loadMyGroupScreen(groupId), isScreenSignedOut);
    if (!answer || thisLoad !== latestLoad.current) {
      return;
    }
    if (answer.kind === "unavailable" && shown.current?.kind === "loaded") {
      // The expense a save stored may be missing from these rows, but they are better than none.
      setReload("failed");
      return;
    }
    shown.current = answer;
    setScreen(answer);
    setReload("idle");
  }, [guard, groupId]);

  useEffect(() => {
    // `load` changes with the group id: another group must not show the first one's rows when its
    // own load fails, so start from the loading line.
    if (shown.current !== null) {
      shown.current = null;
      setScreen(null);
      setReload("idle");
      setAdding(false);
    }
    load();
  }, [load]);

  useEffect(() => {
    loadBalancesNow();
  }, [loadBalancesNow]);

  async function retryBalances() {
    if (retryingBalances.current) {
      return;
    }
    retryingBalances.current = true;
    try {
      await loadBalancesNow();
    } finally {
      retryingBalances.current = false;
    }
  }

  async function retry() {
    if (retrying.current) {
      return;
    }
    retrying.current = true;
    if (shown.current?.kind === "loaded") {
      // Keep the rows on screen while the reload runs.
      setReload("running");
    } else {
      // Back to the loading line until the request answers.
      shown.current = null;
      setScreen(null);
    }
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
      {myId && (
        <BalancesSection
          state={balances}
          myId={myId}
          groupId={groupId}
          onRetry={retryBalances}
          onPaid={loadBalancesNow}
        />
      )}
      {(screen === null || reload === "running") && (
        <Text testID="expenses-loading">{expensesCopy.loading}</Text>
      )}
      {(screen?.kind === "unavailable" || reload === "failed") && (
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
          {reload !== "idle" ? null : adding && myId ? (
            <ExpenseForm
              groupId={groupId}
              myId={myId}
              memberIds={screen.group.members.map((member) => member.userId)}
              onSaved={async () => {
                // No insert of our own: the list is what the API says after the save.
                await Promise.all([load(), loadBalancesNow()]);
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

/** Each member's balance and who pays whom, or the loading line, or the error with its retry. */
function BalancesSection({
  state,
  myId,
  groupId,
  onRetry,
  onPaid,
}: {
  state: BalancesState | null;
  myId: string;
  groupId: string;
  onRetry: () => void;
  /** Reloads the balances from the API after a payment was recorded. */
  onPaid: () => Promise<void>;
}) {
  const guard = useSessionGuard();
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  // `paying` disables the buttons only from the next render; this stops a second fast tap, and a
  // tap on another line's button, while a payment is being recorded.
  const inFlight = useRef(false);

  async function pay(payeeId: string, amount: number) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPaying(true);
    setPayError(null);
    try {
      const outcome = await guard(
        () => recordMyPayment({ groupId, myId, payeeId, amount }),
        isRecordSettlementSignedOut,
      );
      if (!outcome) {
        return;
      }
      if (!outcome.saved) {
        setPayError(outcome.error);
        return;
      }
      // No arithmetic of our own: the lines are what the API says after the payment.
      await onPaid();
    } finally {
      inFlight.current = false;
      setPaying(false);
    }
  }

  const loaded = state?.kind === "loaded" ? state : null;
  const rows = loaded ? balanceRows(loaded.balances.balances, myId, loaded.members) : [];
  const lines = loaded ? paymentLines(loaded.balances.suggestions, myId, loaded.members) : [];
  return (
    <View testID="balances-section" style={styles.form}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {balancesCopy.title}
      </Text>
      {state === null && <Text testID="balances-loading">{balancesCopy.loading}</Text>}
      {state?.kind === "unavailable" && (
        <>
          <Text testID="balances-error" style={styles.error}>
            {balancesCopy.unavailable}
          </Text>
          <Pressable testID="balances-retry" style={styles.button} onPress={onRetry}>
            <Text style={styles.buttonText}>{balancesCopy.retry}</Text>
          </Pressable>
        </>
      )}
      {loaded && (
        <>
          {lines.length === 0 && (
            <Text testID="balances-settled" style={styles.muted}>
              {balancesCopy.settled}
            </Text>
          )}
          {rows.map((row) => (
            <View key={row.userId} testID="balance-row" style={styles.row}>
              <Text style={[styles.description, styles.rowText]}>{row.label}</Text>
              <Text style={styles.description}>{row.amount}</Text>
            </View>
          ))}
          {payError && (
            <Text testID="pay-error" style={styles.error} accessibilityRole="alert">
              {payError}
            </Text>
          )}
          {lines.map((line) => (
            <View key={`${line.from}-${line.to}`} style={styles.row}>
              <Text testID="payment-line" style={[styles.description, styles.rowText]}>
                {line.text}
              </Text>
              {line.from === myId && (
                <Pressable
                  testID="pay-button"
                  style={[styles.button, paying && styles.busy]}
                  // `disabled` alone, as on the save button: see `ExpenseForm`.
                  disabled={paying}
                  onPress={() => pay(line.to, line.amount)}
                >
                  <Text style={styles.buttonText}>
                    {paying ? settlementsCopy.paying : settlementsCopy.pay}
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
        </>
      )}
    </View>
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
  sectionTitle: { fontSize: 18, fontWeight: "600" },
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
