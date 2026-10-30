import type { Metadata } from "next";
import { copy } from "@/lib/copy";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: `${copy.emailHeading} · Góp`,
};

export default function SignInPage() {
  return (
    <main className="home">
      <h1>{copy.emailHeading}</h1>
      <SignInForm />
    </main>
  );
}
