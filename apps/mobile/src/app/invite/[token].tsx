import { useLocalSearchParams } from "expo-router";
import { InviteScreen } from "@/invite-screen";

/** The route only reads the token: the screen lives outside `src/app` so its test can too. */
export default function InviteRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <InviteScreen token={token} />;
}
