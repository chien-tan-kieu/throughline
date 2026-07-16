import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncVersion } from "../sync-version.mjs";

async function makeFixture(version: string) {
  const root = await mkdtemp(join(tmpdir(), "sync-version-"));

  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "throughline", version }, null, 2),
  );

  for (const pkg of ["server", "web", "shared"]) {
    await mkdir(join(root, `packages/${pkg}`), { recursive: true });
    await writeFile(
      join(root, `packages/${pkg}/package.json`),
      JSON.stringify({ name: `@throughline/${pkg}`, version: "0.0.0" }, null, 2),
    );
  }

  await mkdir(join(root, "packages/server/src"), { recursive: true });
  await writeFile(
    join(root, "packages/server/src/index.ts"),
    'export const VERSION = "0.0.0";\n',
  );

  await mkdir(join(root, "plugin"), { recursive: true });
  await writeFile(
    join(root, "plugin/plugin.json"),
    JSON.stringify({ name: "throughline", version: "0.0.0" }, null, 2),
  );

  await mkdir(join(root, ".claude-plugin"), { recursive: true });
  await writeFile(
    join(root, ".claude-plugin/plugin.json"),
    JSON.stringify({ name: "throughline", version: "0.0.0" }, null, 2),
  );
  await writeFile(
    join(root, ".claude-plugin/marketplace.json"),
    JSON.stringify(
      {
        name: "throughline",
        plugins: [{ name: "throughline", version: "0.0.0", source: "./" }],
      },
      null,
      2,
    ),
  );

  return root;
}

describe("syncVersion", () => {
  test("propagates version to all derived locations, including .claude-plugin files", async () => {
    const root = await makeFixture("2.3.4");

    await syncVersion(root);

    for (const pkg of ["server", "web", "shared"]) {
      const pkgJson = JSON.parse(
        await readFile(join(root, `packages/${pkg}/package.json`), "utf8"),
      );
      expect(pkgJson.version).toBe("2.3.4");
    }

    const pluginJson = JSON.parse(await readFile(join(root, "plugin/plugin.json"), "utf8"));
    expect(pluginJson.version).toBe("2.3.4");

    const indexContent = await readFile(join(root, "packages/server/src/index.ts"), "utf8");
    expect(indexContent).toContain('const VERSION = "2.3.4";');

    const claudePluginJson = JSON.parse(
      await readFile(join(root, ".claude-plugin/plugin.json"), "utf8"),
    );
    expect(claudePluginJson.version).toBe("2.3.4");

    const marketplaceJson = JSON.parse(
      await readFile(join(root, ".claude-plugin/marketplace.json"), "utf8"),
    );
    expect(marketplaceJson.plugins[0].version).toBe("2.3.4");
  });
});
