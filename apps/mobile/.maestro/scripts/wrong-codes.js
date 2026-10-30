// Sends 5 wrong codes for output.email straight to the API, using up the code's attempts.
const wrong = output.code === "000000" ? "111111" : "000000";
for (let i = 0; i < 5; i++) {
  const res = http.post(`${API_URL}/auth/sign-in`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: output.email, code: wrong }),
  });
  if (res.status !== 401) {
    throw new Error(`wrong code ${i + 1} answered ${res.status}`);
  }
}
