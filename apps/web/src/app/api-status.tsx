import { type HealthResponse, healthResponseSchema } from "@gop/shared";
import { connection } from "next/server";

async function fetchHealth(): Promise<HealthResponse | null> {
  // Read at request time, after connection(), so one build works in every environment.
  const apiUrl = process.env.API_URL ?? "http://localhost:3001";
  try {
    const res = await fetch(`${apiUrl}/health`);
    return healthResponseSchema.parse(await res.json());
  } catch {
    return null;
  }
}

/** Server component: asks the API for its health on every request. */
export async function ApiStatus() {
  await connection();
  const health = await fetchHealth();

  if (!health) {
    return <p className="status status-down">API: không kết nối được</p>;
  }
  return (
    <p className={`status ${health.status === "ok" ? "status-ok" : "status-down"}`}>
      API: {health.status} · v{health.version} · DB: {health.db}
    </p>
  );
}
