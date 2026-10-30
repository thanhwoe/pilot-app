import { changeEmail, signInCopy as copy, type SignInState, submitEmail } from "@gop/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { authApi } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function SignIn() {
  const session = useSession();
  const [state, setState] = useState<SignInState>({ step: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<SignInState>) {
    setPending(true);
    try {
      setState(await action());
    } finally {
      setPending(false);
    }
  }

  async function submitCode(email: string) {
    setPending(true);
    try {
      const outcome = await session.signIn({ email, code });
      // On success the session changes and the guard in _layout shows home.
      if (!("signedIn" in outcome)) {
        setState(outcome);
      }
    } finally {
      setPending(false);
    }
  }

  function backToEmail() {
    if (state.step === "code") {
      setEmail(state.email);
      setCode("");
      setState(changeEmail(state.email));
    }
  }

  return (
    <View style={styles.container}>
      {state.step === "email" ? (
        <>
          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="email-input"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
        </>
      ) : (
        <>
          <Text>{copy.codePrompt(state.email)}</Text>
          <Text style={styles.label}>Mã</Text>
          <TextInput
            testID="code-input"
            style={styles.input}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
        </>
      )}
      {state.error && (
        <Text testID="form-error" style={styles.error} accessibilityRole="alert">
          {state.error}
        </Text>
      )}
      {state.step === "email" ? (
        <Pressable
          testID="send-code"
          style={styles.button}
          disabled={pending}
          onPress={() => run(() => submitEmail(authApi, { email }))}
        >
          <Text style={styles.buttonText}>{copy.sendCode}</Text>
        </Pressable>
      ) : (
        <>
          <Pressable
            testID="sign-in"
            style={styles.button}
            disabled={pending}
            onPress={() => submitCode(state.email)}
          >
            <Text style={styles.buttonText}>{copy.signIn}</Text>
          </Pressable>
          <Pressable testID="change-email" disabled={pending} onPress={backToEmail}>
            <Text style={styles.link}>{copy.useAnotherEmail}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 12, padding: 24 },
  label: { fontSize: 16 },
  input: { borderWidth: 1, borderRadius: 6, borderColor: "#888", padding: 10, fontSize: 16 },
  error: { color: "#cf222e" },
  button: { alignSelf: "flex-start", backgroundColor: "#171717", borderRadius: 6, padding: 12 },
  buttonText: { color: "#fff", fontSize: 16 },
  link: { textDecorationLine: "underline", fontSize: 16 },
});
