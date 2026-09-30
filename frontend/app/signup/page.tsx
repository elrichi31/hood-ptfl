import { redirect } from "next/navigation";

// Old bookmarks must not offer registration when the API has it disabled.
export default function SignupPage() {
  redirect("/login");
}
