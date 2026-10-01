// Presence only: never print, serialize, or return credential values.
export function checkGoogleOAuthConfig(env, report) {
  let configured = true;
  for (const name of ["ATE05_GOOGLE_CLIENT_ID", "ATE05_GOOGLE_CLIENT_SECRET"]) {
    const present =
      typeof env[name] === "string" && env[name].trim().length > 0;
    report(`${name}: ${present ? "configured" : "missing"}`);
    configured &&= present;
  }
  return configured;
}
