import { signInCopy as copy } from "@gop/shared";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider, useSession } from "@/lib/session";

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootStack />
      <StatusBar style="auto" />
    </SessionProvider>
  );
}

function RootStack() {
  const { state } = useSession();
  if (state.kind === "loading") {
    return null;
  }
  // Signed in, or holding a token the API couldn't be asked about: home, which offers sign-out.
  const signedIn = state.kind !== "clear";

  return (
    <Stack screenOptions={{ title: "Góp" }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ title: copy.emailHeading }} />
      </Stack.Protected>
    </Stack>
  );
}
