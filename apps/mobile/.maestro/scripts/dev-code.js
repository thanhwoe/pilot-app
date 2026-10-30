// Reads the latest code the API sent to output.email from the dev code endpoint.
const res = http.get(`${API_URL}/dev/sign-in-code?email=${encodeURIComponent(output.email)}`);
if (res.status !== 200) {
  throw new Error(`no code was sent to ${output.email} (status ${res.status})`);
}
output.code = json(res.body).code;
