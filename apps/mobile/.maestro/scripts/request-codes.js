// Asks the API straight for COUNT codes for output.email, to reach the rate limit.
for (let i = 0; i < Number(COUNT); i++) {
  const res = http.post(`${API_URL}/auth/code`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: output.email }),
  });
  if (res.status !== 204) {
    throw new Error(`code request ${i + 1} answered ${res.status}`);
  }
}
