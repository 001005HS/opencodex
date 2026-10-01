import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { loadConfig } from "../config";
import { chatgptShimLauncherPath, writeChatgptShimLauncher } from "../chatgpt/app-server-shim/launcher";

const USAGE = `Usage (experimental, macOS only):
  ocx chatgpt launch   Relaunch ChatGPT with the experimental app-server shim (requires appServerShim: true)
  ocx chatgpt restore  Relaunch ChatGPT without the experimental shim and remove its launcher
  ocx chatgpt status   Inspect experimental flag, launcher and running app environment`;

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 5000 });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

/**
 * Only inspect the named bundle process; never print the environment being inspected.
 * `-a` keeps ancestors in the match: when ocx runs inside a ChatGPT/Codex session the app is
 * one of this process's ancestors, and plain `pgrep -x` would report it as not running.
 */
function appState(launcher: string): { running: boolean; shim: boolean } {
  const pids = run("pgrep", ["-a", "-x", "ChatGPT"]);
  if (!pids.ok) return { running: false, shim: false };
  for (const pid of pids.output.split(/\s+/).filter(value => /^\d+$/.test(value))) {
    const command = run("ps", ["eww", "-o", "command=", "-p", pid]);
    if (command.ok && command.output.includes("ChatGPT.app/Contents/MacOS/ChatGPT")) {
      const marker = `CODEX_CLI_PATH=${launcher}`;
      const start = command.output.indexOf(marker);
      return { running: true, shim: start >= 0 && (start === 0 || command.output[start - 1] === " ")
        && (start + marker.length === command.output.length || command.output[start + marker.length] === " ") };
    }
  }
  return { running: false, shim: false };
}

/** Adapted from #5947: open ignores new launch settings until the previous app exits. */
async function quitApp(launcher: string): Promise<boolean> {
  if (!appState(launcher).running) return true;
  for (let attempt = 0; attempt < 3; attempt++) {
    run("osascript", ["-e", 'quit app "ChatGPT"']);
    for (let poll = 0; poll < 20; poll++) {
      if (!appState(launcher).running) return true;
      await Bun.sleep(250);
    }
  }
  return !appState(launcher).running;
}

export async function handleChatgptCommand(args: string[], platform: NodeJS.Platform = process.platform): Promise<number> {
  const sub = args[0];
  if (!sub || ["help", "--help", "-h"].includes(sub)) {
    console.log(USAGE);
    return sub ? 0 : 64;
  }
  if (!["launch", "restore", "status"].includes(sub) || args.length !== 1) {
    console.error(USAGE);
    return 64;
  }
  if (platform !== "darwin") {
    console.error("ChatGPT app-server shim (experimental): macOS only.");
    return 1;
  }
  try {
    const config = loadConfig();
    const launcher = chatgptShimLauncherPath();
    if (sub === "status") {
      const app = appState(launcher);
      console.log(`app-server shim (experimental): ${config.chatgptDesktop?.appServerShim === true ? "on" : "off"}
launcher: ${existsSync(launcher) ? "present" : "absent"}
app: ${app.running ? "running" : "not running"}
CODEX_CLI_PATH launcher: ${app.shim ? "yes" : "no"}`);
      return 0;
    }
    if (sub === "launch") {
      if (config.chatgptDesktop?.appServerShim !== true) {
        console.error('Experimental shim disabled; set chatgptDesktop.appServerShim: true before launching.');
        return 1;
      }
      writeChatgptShimLauncher();
    }
    if (!(await quitApp(launcher))) {
      console.error("ChatGPT did not quit; quit it manually and retry.");
      return 1;
    }
    // Remove an inherited override too: restore must launch without CODEX_CLI_PATH.
    const env = { ...process.env };
    delete env.CODEX_CLI_PATH;
    const result = spawnSync("open", ["-a", "ChatGPT", ...(sub === "launch" ? ["--env", `CODEX_CLI_PATH=${launcher}`] : [])], {
      encoding: "utf8", env, timeout: 10000,
    });
    if (result.status !== 0) throw new Error(result.error?.message ?? (result.stderr?.trim() || "open failed"));
    if (sub === "restore") rmSync(launcher, { force: true });
    console.log(`ChatGPT relaunched ${sub === "launch" ? "with" : "without"} the experimental app-server shim.`);
    return 0;
  } catch (error) {
    console.error(`ChatGPT shim (experimental): ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
