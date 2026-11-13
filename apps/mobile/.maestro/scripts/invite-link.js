// Through the API only: makes a group "output.groupName" for a host user and a fresh invite link
// to it, and leaves it in output.inviteLink. The host is output.hostEmail, or a new user when
// that is not set; a host who already has a group of that name keeps it. The host signs in once
// here, so a host that also signed in through the app stays under the API's 5 codes per email.
const json_ = { "Content-Type": "application/json" };

function signIn(email) {
  const asked = http.post(`${API_URL}/auth/code`, {
    headers: json_,
    body: JSON.stringify({ email }),
  });
  if (asked.status !== 204) {
    throw new Error(`code request for ${email} answered ${asked.status}`);
  }
  const code = json(
    http.get(`${API_URL}/dev/sign-in-code?email=${encodeURIComponent(email)}`).body,
  ).code;
  const res = http.post(`${API_URL}/auth/sign-in`, {
    headers: json_,
    body: JSON.stringify({ email, code }),
  });
  if (res.status !== 200) {
    throw new Error(`sign-in for ${email} answered ${res.status}`);
  }
  return json(res.body);
}

function call(method, path, token, body) {
  const headers = { ...json_, authorization: `Bearer ${token}` };
  const res =
    method === "GET"
      ? http.get(`${API_URL}${path}`, { headers })
      : http.post(`${API_URL}${path}`, {
          headers,
          body: JSON.stringify(body === undefined ? {} : body),
        });
  if (res.status >= 300) {
    throw new Error(`${method} ${path} answered ${res.status}`);
  }
  return json(res.body);
}

output.hostEmail =
  output.hostEmail ||
  "h-" + Date.now() + "-" + Math.floor(Math.random() * 1000000) + "@example.test";
const host = signIn(output.hostEmail);
const name = output.groupName || "Da Lat";
const group =
  call("GET", "/groups", host.token).groups.find((g) => g.name === name) ||
  call("POST", "/groups", host.token, { name });
const invite = call("POST", `/groups/${group.id}/invite`, host.token);
output.inviteLink = `gop://invite/${invite.token}`;
