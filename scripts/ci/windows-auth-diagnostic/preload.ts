import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRecorder } from "./recorder";

// Loaded by the explicit diagnostic overlay after the normal test-home guard.
if (process.platform === "win32" && process.env.GITHUB_ACTIONS === "true") {
  const control = process.env.OCX_WAUTH_CONTROL;
  const artifacts = process.env.OCX_WAUTH_ARTIFACTS;
  if (control && artifacts && process.env.OCX_TEST_HOME_GUARD === "1") {
    const text = readFileSync(join(control, "session.json"), "utf8");
    if (text.length > 4096) throw new Error("diagnostic session oversized");
    const session = JSON.parse(text) as { salt: string; allowedTempRoot: string };
    if (!/^[a-f0-9]{64}$/.test(session.salt) || typeof session.allowedTempRoot !== "string") {
      throw new Error("diagnostic session invalid");
    }
    Reflect.set(globalThis, "__ocxWindowsAuthTrace", createRecorder({ control, artifacts, ...session }));
  }
}
