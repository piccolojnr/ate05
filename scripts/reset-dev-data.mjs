import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import readline from "node:readline/promises";

const appIdentifier = "com.ate05.pos";
const platform = process.platform;
const home = os.homedir();

function platformDirectory(kind) {
  if (platform === "win32") {
    const base =
      kind === "config"
        ? process.env.APPDATA
        : process.env.LOCALAPPDATA || process.env.APPDATA;
    return base || path.join(home, "AppData", "Local");
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support");
  }
  const configured =
    kind === "config" ? process.env.XDG_CONFIG_HOME : process.env.XDG_DATA_HOME;
  return (
    configured ||
    path.join(home, kind === "config" ? ".config" : ".local/share")
  );
}

const configDirectory = path.join(platformDirectory("config"), appIdentifier);
const dataDirectory = path.join(platformDirectory("data"), appIdentifier);
const targets = [
  path.join(configDirectory, "ate05.db"),
  path.join(configDirectory, "ate05.db-wal"),
  path.join(configDirectory, "ate05.db-shm"),
  dataDirectory,
];

console.log("ATE05 development data reset");
console.log("");
console.log("This removes the local development database and backups.");
console.log(
  "It does not uninstall ATE05. If a packaged build uses this same profile, its local data is also included.",
);
console.log("");
console.log("Targets:");
for (const target of targets) console.log(`- ${target}`);
console.log("");
console.log("Close all ATE05 windows before continuing.");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const confirmation = await rl.question(
  "Type RESET ATE05 DEV DATA to continue: ",
);
rl.close();

if (confirmation !== "RESET ATE05 DEV DATA") {
  console.log("Reset cancelled.");
  process.exit(0);
}

for (const target of targets) {
  try {
    await fs.rm(target, { recursive: true, force: true });
    console.log(`Removed ${target}`);
  } catch (error) {
    console.error(`Could not remove ${target}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (!process.exitCode) {
  console.log("");
  console.log("Development data reset. Start ATE05 to begin first-run setup.");
}
