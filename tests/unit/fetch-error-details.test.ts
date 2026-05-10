import { describe, expect, it } from "vitest";
import { describeFetchError } from "../../src/eval/fetch-error-details.js";

describe("fetch error details", () => {
  it("includes nested cause network fields", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {
      code: "ECONNREFUSED",
      errno: -61,
      syscall: "connect",
      address: "127.0.0.1",
      port: 443
    });
    const top = Object.assign(new TypeError("fetch failed"), { cause });
    const text = describeFetchError(top);
    expect(text).toContain("TypeError");
    expect(text).toContain("fetch failed");
    expect(text).toContain("ECONNREFUSED");
    expect(text).toContain("address=127.0.0.1");
    expect(text).toContain("port=443");
  });
});
