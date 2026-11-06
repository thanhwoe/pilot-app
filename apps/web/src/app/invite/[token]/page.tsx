import type { Metadata } from "next";
import { Suspense } from "react";
import { Invite } from "../invite";

export const metadata: Metadata = {
  title: "Lời mời vào nhóm · Góp",
};

/** The invite is read behind `<Suspense>`: it needs the session cookie and the API. */
async function InviteForToken({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  const { token } = await params;
  return <Invite token={token} />;
}

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="home">
      <h1>Góp</h1>
      <Suspense fallback={<p className="status">Đang tải lời mời…</p>}>
        <InviteForToken params={params} />
      </Suspense>
    </main>
  );
}
