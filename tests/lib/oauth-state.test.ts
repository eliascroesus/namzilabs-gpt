import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

import { resetEnvForTests } from "@/lib/env";
import {
  createOAuthState,
  openOAuthState,
  pkceChallenge,
  sealOAuthState,
} from "@/server/oauth/state";

describe("OAuth state", () => {
  beforeEach(() => {
    process.env.APP_ENV = "test";
    process.env.ENCRYPTION_KEY_BASE64 = randomBytes(32).toString("base64");
    resetEnvForTests();
  });

  it("signs state and binds provider, tenant and connection", () => {
    const state = createOAuthState(
      "google-sheets",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    );
    expect(openOAuthState(sealOAuthState(state))).toEqual(state);
    expect(pkceChallenge(state.verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("rejects tampering", () => {
    const state = createOAuthState(
      "close",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    );
    const sealed = sealOAuthState(state);
    expect(() => openOAuthState(`${sealed.slice(0, -2)}aa`)).toThrow("OAuth state is invalid");
  });
});
