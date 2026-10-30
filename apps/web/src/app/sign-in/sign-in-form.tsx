import { copy } from "@/lib/copy";

export function SignInForm() {
  return (
    <form className="sign-in">
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="text" inputMode="email" autoComplete="email" required />
      <button type="submit">{copy.sendCode}</button>
    </form>
  );
}
