import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { recordStopOutcome, stopFailure } from "./stop-diagnostics.js";
import { windowsPrivatePath } from "@linger/local-installation/windows-private";

test("persists bounded redacted first failure and latest successful retry", async () => {
  const home = await mkdtemp(
    path.join(
      process.platform === "win32" ? homedir() : tmpdir(),
      "stop-diagnostics-",
    ),
  );
  try {
    if (process.platform === "win32")
      await windowsPrivatePath(home, "directory", true);
    const failure = stopFailure("services", {
      code: "NATIVE_PROCESS_IDENTITY_UNVERIFIED",
      nativeService: "postgres",
      message: "secret",
    });
    await recordStopOutcome(home, Array(100).fill(failure));
    const firstPath = path.join(home, "installer", "stop-first-failure.json");
    const first = await readFile(firstPath, "utf8");
    expect(first).not.toContain("secret");
    expect(JSON.parse(first)).toMatchObject({
      exitCode: 1,
      failures: Array(12).fill(failure),
    });
    await recordStopOutcome(home, []);
    expect(await readFile(firstPath, "utf8")).toBe(first);
    expect(
      JSON.parse(
        await readFile(
          path.join(home, "installer", "stop-latest.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ exitCode: 0, failures: [] });
    expect(
      stopFailure("localmodels", { code: "secret", nativeService: "secret" }),
    ).toEqual({ stage: "localmodels", code: "STOP_FAILED" });
    expect(stopFailure("manager", { name: "TimeoutError" }).code).toBe(
      "TIMEOUT",
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}, 60_000);
