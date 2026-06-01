import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncVersion } from "../../../scripts/sync-version.mjs";

function makeTempRepo(version: string): string {
  const root = join(tmpdir(), `cc-sync-test-${Date.now()}`);
  mkdirSync(join(root, "packages/server/src"), { recursive: true });
  mkdirSync(join(root, "packages/web"), { recursive: true });
  mkdirSync(join(root, "packages/shared"), { recursive: true });
  mkdirSync(join(root, "plugin"), { recursive: true });

  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "claude-control", version, private: true }, null, 2) + "\n",
  );

  for (const pkg of ["server", "web", "shared"]) {
    writeFileSync(
      join(root, `packages/${pkg}/package.json`),
      JSON.stringify({ name: `@cc/${pkg}`, version: "0.0.0" }, null, 2) + "\n",
    );
  }

  writeFileSync(
    join(root, "plugin/plugin.json"),
    JSON.stringify({ name: "claude-control", version: "0.0.0" }, null, 2) + "\n",
  );

  writeFileSync(
    join(root, "packages/server/src/index.ts"),
    `const VERSION = "0.0.0";\nexport { VERSION };\n`,
  );

  return root;
}

describe("syncVersion", () => {
  test("propagates root package.json version to all derived locations", async () => {
    const root = makeTempRepo("2.3.4");
    await syncVersion(root);

    const serverPkg = JSON.parse(readFileSync(join(root, "packages/server/package.json"), "utf8"));
    expect(serverPkg.version).toBe("2.3.4");

    const webPkg = JSON.parse(readFileSync(join(root, "packages/web/package.json"), "utf8"));
    expect(webPkg.version).toBe("2.3.4");

    const sharedPkg = JSON.parse(readFileSync(join(root, "packages/shared/package.json"), "utf8"));
    expect(sharedPkg.version).toBe("2.3.4");

    const pluginJson = JSON.parse(readFileSync(join(root, "plugin/plugin.json"), "utf8"));
    expect(pluginJson.version).toBe("2.3.4");

    const indexTs = readFileSync(join(root, "packages/server/src/index.ts"), "utf8");
    expect(indexTs).toContain('const VERSION = "2.3.4"');
  });

  test("preserves other fields when updating package.json files", async () => {
    const root = makeTempRepo("1.2.0");
    await syncVersion(root);

    const serverPkg = JSON.parse(readFileSync(join(root, "packages/server/package.json"), "utf8"));
    expect(serverPkg.name).toBe("@cc/server");
  });
});
