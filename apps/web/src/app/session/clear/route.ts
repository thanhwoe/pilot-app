import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * Removes a session cookie the API rejected; a Server Component can't change cookies itself.
 * It always goes to the fixed /sign-in and reads no query, so a link to it can only sign this
 * browser out, never send anyone elsewhere.
 */
export async function GET() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/sign-in");
}
