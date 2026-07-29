import { redirect } from "next/navigation";

/**
 * `/privacy` is the URL people guess for a privacy policy — and it used to be
 * the signed-in rights centre, so an anonymous visitor typing it got a login
 * form instead of the notice. The notice lives at `/legal/privacy` and the
 * rights centre moved to `/my-data`, which says what it is.
 */
export default function PrivacyRedirect() {
  redirect("/legal/privacy");
}
