import assert from "node:assert/strict";
import test from "node:test";
import { checkGoogleOAuthConfig } from "./check-google-oauth-config.mjs";

const configured = {
  ATE05_GOOGLE_CLIENT_ID: "test-only-client-id",
  ATE05_GOOGLE_CLIENT_SECRET: "test-only-placeholder-not-a-credential",
};

for (const missing of [
  "ATE05_GOOGLE_CLIENT_ID",
  "ATE05_GOOGLE_CLIENT_SECRET",
]) {
  test(`rejects missing ${missing}`, () => {
    const env = { ...configured };
    delete env[missing];
    const output = [];
    assert.equal(
      checkGoogleOAuthConfig(env, (line) => output.push(line)),
      false,
    );
    assert.ok(output.includes(`${missing}: missing`));
    assert.ok(output.every((line) => !line.includes("test-only")));
  });
}

test("rejects blank configuration", () => {
  assert.equal(
    checkGoogleOAuthConfig(
      { ATE05_GOOGLE_CLIENT_ID: " ", ATE05_GOOGLE_CLIENT_SECRET: "\t\n" },
      () => {},
    ),
    false,
  );
});

test("reports presence without disclosing configured values", () => {
  const output = [];
  assert.equal(
    checkGoogleOAuthConfig(configured, (line) => output.push(line)),
    true,
  );
  assert.deepEqual(output, [
    "ATE05_GOOGLE_CLIENT_ID: configured",
    "ATE05_GOOGLE_CLIENT_SECRET: configured",
  ]);
});
