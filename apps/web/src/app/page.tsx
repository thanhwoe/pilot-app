import { Suspense } from "react";
import { ApiStatus } from "./api-status";

export default function Home() {
  return (
    <main className="home">
      <h1>Góp</h1>
      <p>Chia tiền nhóm, biết ai nợ ai.</p>
      <Suspense fallback={<p className="status">Đang kiểm tra API…</p>}>
        <ApiStatus />
      </Suspense>
    </main>
  );
}
