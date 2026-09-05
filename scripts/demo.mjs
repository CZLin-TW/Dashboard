import { spawn } from "node:child_process";

// Dedicated localhost origin. The demo deliberately refuses any configured live credentials.
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3001", ...process.argv.slice(2)], {
  stdio: "inherit", env: { ...process.env, DASHBOARD_DEMO_MODE: "1" },
});
child.on("exit", code => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
