// Through the API only: adds a second member to output.email's group "Da Lat", then two expenses,
// "An toi" (90.000) paid by the second member and, after it, "Taxi" (50.000) paid by output.email.
// Leaves output.otherEmail for the flow to look for. Each user signs in once here, so the first
// user (who signed in through the app too) and the second stay under the API's 5 codes per email.
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

const first = signIn(output.email);
const group = call("GET", "/groups", first.token).groups.find((g) => g.name === output.groupName);
if (!group) {
  throw new Error(`${output.email} has no group named ${output.groupName}`);
}
const invite = call("POST", `/groups/${group.id}/invite`, first.token);

output.otherEmail = "o-" + Date.now() + "-" + Math.floor(Math.random() * 1000000) + "@example.test";
const second = signIn(output.otherEmail);
call("POST", "/invites/join", second.token, { token: invite.token });

const everyone = [first.user.id, second.user.id];
call("POST", `/groups/${group.id}/expenses`, second.token, {
  payerId: second.user.id,
  amount: 90000,
  description: "An toi",
  splitBetween: everyone,
});
call("POST", `/groups/${group.id}/expenses`, first.token, {
  payerId: first.user.id,
  amount: 50000,
  description: "Taxi",
  splitBetween: everyone,
});
