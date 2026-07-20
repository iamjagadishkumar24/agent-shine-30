import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

describe("rebrand guard", () => {
  it("has no legacy Zenwork references anywhere in the repo", () => {
    const result = spawnSync("node", ["scripts/check-rebrand.mjs"], {
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(
        `check-no-zenwork.mjs failed:\n${result.stdout}\n${result.stderr}`,
      );
    }
    expect(result.status).toBe(0);
  });
});
