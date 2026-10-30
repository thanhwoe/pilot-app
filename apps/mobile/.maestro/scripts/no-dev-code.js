// Fails if the API sent any code to output.email.
const res = http.get(`${API_URL}/dev/sign-in-code?email=${encodeURIComponent(output.email)}`);
if (res.status !== 404) {
  throw new Error(`a code was sent to ${output.email} (status ${res.status})`);
}
