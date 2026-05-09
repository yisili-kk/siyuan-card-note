import { existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");
const packagePath = resolve(root, "package.zip");

if (!existsSync(dist)) {
  throw new Error("dist directory does not exist. Run vite build first.");
}

rmSync(packagePath, { force: true });
execFileSync("zip", ["-qr", packagePath, "."], { cwd: dist, stdio: "inherit" });
