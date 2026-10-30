import { signInCopy as copy } from "@gop/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function SignIn() {
  const [email, setEmail] = useState("");

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Email</Text>
      <TextInput
        testID="email-input"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Pressable testID="send-code" style={styles.button}>
        <Text style={styles.buttonText}>{copy.sendCode}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 12, padding: 24 },
  label: { fontSize: 16 },
  input: { borderWidth: 1, borderRadius: 6, borderColor: "#888", padding: 10, fontSize: 16 },
  button: { alignSelf: "flex-start", backgroundColor: "#171717", borderRadius: 6, padding: 12 },
  buttonText: { color: "#fff", fontSize: 16 },
});
