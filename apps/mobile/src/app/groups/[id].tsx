import { useLocalSearchParams } from "expo-router";
import { GroupScreen } from "@/group-screen";

/** The route only reads the id: the screen lives outside `src/app` so its test can too. */
export default function GroupRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupScreen groupId={id} />;
}
