import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const sentinel = "chat-access-sentinel-do-not-ship";
const build = spawnSync("npx", ["next", "build"], {
  env: {
    ...process.env,
    CHAT_ACCESS_TOKEN: sentinel,
    ANTHROPIC_API_KEY: "anthropic-test-key-not-real",
  },
  stdio: "inherit",
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

const files = await walk(".next/static");
const needle = Buffer.from(sentinel);
const hits = [];
for (const file of files) {
  const bytes = await readFile(file);
  if (bytes.includes(needle)) hits.push(file);
}

if (hits.length > 0) {
  console.error("Client static files contain the fake chat access sentinel:");
  for (const hit of hits) console.error(hit);
  process.exit(1);
}

console.log(`Scanned ${files.length} client static files. The fake chat access sentinel is absent.`);
