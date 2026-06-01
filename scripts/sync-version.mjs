import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads the version from root package.json and propagates it to all derived locations.
 *
 * Derived locations:
 *   packages/server/package.json
 *   packages/web/package.json
 *   packages/shared/package.json
 *   plugin/plugin.json
 *   packages/server/src/index.ts  (const VERSION = "..." literal)
 *
 * @param {string} rootDir - repo root directory
 */
export async function syncVersion(rootDir) {
  const rootPkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  const { version } = rootPkg;

  for (const pkg of ["server", "web", "shared"]) {
    const pkgPath = join(rootDir, `packages/${pkg}/package.json`);
    const pkgJson = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkgJson.version = version;
    writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n", "utf8");
  }

  const pluginPath = join(rootDir, "plugin/plugin.json");
  const pluginJson = JSON.parse(readFileSync(pluginPath, "utf8"));
  pluginJson.version = version;
  writeFileSync(pluginPath, JSON.stringify(pluginJson, null, 2) + "\n", "utf8");

  const indexPath = join(rootDir, "packages/server/src/index.ts");
  const indexContent = readFileSync(indexPath, "utf8");
  const updated = indexContent.replace(
    /^const VERSION = "[^"]*";/m,
    `const VERSION = "${version}";`,
  );
  writeFileSync(indexPath, updated, "utf8");
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await syncVersion(process.argv[2] ?? process.cwd());
}
