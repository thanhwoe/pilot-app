import { groupsCopy, type InviteState, invitesCopy, isInviteSignedOut } from "@gop/shared";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { joinMyInvite, openMyInvite } from "@/lib/invites";
import { setPendingInvite } from "@/lib/pending-invite";
import { useSession } from "@/lib/session";
import { useSessionGuard } from "@/lib/session-guard";

/**
 * What an invite link opens in the app. `token` is whatever the link carried: the shared flow
 * decides whether it can be an invite's. The route is outside both session guards, so this screen
 * sends a signed-out visitor to sign-in itself and is brought back after it.
 */
export function InviteScreen({ token }: { token: unknown }) {
  const { state: session } = useSession();
  const guard = useSessionGuard();
  const link = typeof token === "string" ? token : "";
  const signedOut = session.kind === "clear";
  const [invite, setInvite] = useState<InviteState | null>(null);
  const [joinFailed, setJoinFailed] = useState(false);
  const [joining, setJoining] = useState(false);
  // `joining` disables the button only from the next render; this stops a second fast tap.
  const inFlight = useRef(false);

  useEffect(() => {
    if (signedOut) {
      // Only a token that could be an invite's is kept; any other link ends at the groups list.
      setPendingInvite(link);
      router.replace("/sign-in");
    }
  }, [signedOut, link]);

  useEffect(() => {
    if (session.kind === "loading" || signedOut) {
      return;
    }
    let current = true;
    // Expo Router updates the params of an open screen when another link arrives: forget the
    // first link's group, so its heading and join button never sit above the second link's token.
    setInvite(null);
    setJoinFailed(false);
    guard(() => openMyInvite(link), isInviteSignedOut).then((answer) => {
      if (!answer || !current) {
        return;
      }
      if (answer.kind === "invite" && answer.alreadyMember) {
        // Already a member: nothing to join, and nothing changes.
        router.replace("/");
        return;
      }
      setInvite(answer);
    });
    return () => {
      current = false;
    };
  }, [guard, link, session.kind, signedOut]);

  async function join() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setJoining(true);
    try {
      const outcome = await guard(() => joinMyInvite(link), isInviteSignedOut);
      if (!outcome) {
        return;
      }
      if (outcome.kind === "joined") {
        router.replace("/");
      } else if (outcome.kind === "bad-link") {
        setInvite({ kind: "bad-link" });
      } else {
        setJoinFailed(true);
      }
    } finally {
      inFlight.current = false;
      setJoining(false);
    }
  }

  if (signedOut || (invite?.kind === "invite" && invite.alreadyMember)) {
    return null;
  }

  return (
    <View style={styles.container}>
      {invite === null && <Text testID="invite-loading">{groupsCopy.loading}</Text>}
      {invite?.kind === "bad-link" && (
        <Text testID="invite-bad-link" style={styles.error}>
          {invitesCopy.badLink}
        </Text>
      )}
      {invite?.kind === "unavailable" && (
        <Text testID="invite-error" style={styles.error}>
          {groupsCopy.unavailable}
        </Text>
      )}
      {invite?.kind === "invite" && (
        <>
          <Text testID="invite-heading" style={styles.heading} accessibilityRole="header">
            {invitesCopy.heading(invite.groupName)}
          </Text>
          {joinFailed && (
            <Text testID="invite-error" style={styles.error} accessibilityRole="alert">
              {groupsCopy.unavailable}
            </Text>
          )}
          <Pressable
            testID="invite-join"
            style={[styles.button, joining && styles.busy]}
            // `disabled` alone: on Android a `busy` state that returns to false keeps "busy" as the
            // button's accessibility text, hiding its label.
            disabled={joining}
            onPress={join}
          >
            <Text style={styles.buttonText}>{invitesCopy.join}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 12, padding: 24 },
  heading: { fontSize: 24, fontWeight: "700" },
  error: { color: "#cf222e" },
  button: { alignSelf: "flex-start", backgroundColor: "#171717", borderRadius: 6, padding: 12 },
  buttonText: { color: "#fff", fontSize: 16 },
  busy: { opacity: 0.5 },
});
