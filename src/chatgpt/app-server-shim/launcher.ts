import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../../config/paths";
import { selfLaunchArgv } from "../../lib/self-launch-argv";

export const CHATGPT_APP_CODEX_BINARY = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";

export function chatgptShimLauncherPath(configDir = getConfigDir()): string {
  return join(configDir, "chatgpt-codex-shim.sh");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * A failed precondition or a failed self-test runs the original binary with untouched stdout.
 * A filter that passes the self-test and then dies mid-session closes the pipe.
 * Expected (not yet validated against the bundled app-server): the server gets SIGPIPE or a
 * write error and Desktop respawns it through the same launcher.
 */
export function buildChatgptShimLauncher(argv: readonly string[], real = CHATGPT_APP_CODEX_BINARY): string {
  return `#!/bin/bash
# opencodex (experimental): ChatGPT app-server stdout passes through the quota-gate filter.
REAL=${shellQuote(real)}
FILTER=(${argv.map(shellQuote).join(" ")})
if [ "$(uname -s)" = "Darwin" ] && [ -x "\${FILTER[0]}" ] \\
   && "\${FILTER[@]}" --self-test >/dev/null 2>&1; then
  exec "$REAL" "$@" > >(exec "\${FILTER[@]}")
fi
exec "$REAL" "$@"
`;
}

export function writeChatgptShimLauncher(configDir = getConfigDir()): string {
  mkdirSync(configDir, { recursive: true });
  const path = chatgptShimLauncherPath(configDir);
  const argv = [process.execPath, ...selfLaunchArgv(["internal", "chatgpt-app-server-filter"])];
  writeFileSync(path, buildChatgptShimLauncher(argv), { mode: 0o755 });
  chmodSync(path, 0o755);
  return path;
}
