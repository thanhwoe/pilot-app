import { signInCopy as copy } from "@gop/shared";
import type { Metadata } from "next";
import { Suspense } from "react";
import { safeReturnPath } from "@/lib/return-path";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: `${copy.emailHeading} · Góp`,
};

/** The form for a visitor who may have come from an invite: `next` is read behind `<Suspense>`. */
async function SignInWithReturn({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const { next } = await searchParams;
  return <SignInForm returnTo={safeReturnPath(next)} />;
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="home">
      <h1>{copy.emailHeading}</h1>
      <Suspense fallback={null}>
        <SignInWithReturn searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
