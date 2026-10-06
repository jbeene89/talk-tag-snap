import { spawnSync } from "node:child_process";

function run(script, args, env = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], {
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("node_modules/vite/bin/vite.js", ["build"], { ...process.env, MOBILE_BUILD: "1" });
if (process.argv.includes("--sync"))
  run("node_modules/@capacitor/cli/bin/capacitor", ["sync", "android"]);
