import { assertEquals, deindent } from "../lib/index.ts";
import { getTestDir } from "../lib/setupTestDir.ts";
import { TestBed } from "../lib/TestBed.ts";

const knownDate = new Date("2020-01-01T00:00:00Z");

Deno.test("new-file-conflict", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | source version\n",
      "user:user | 0755  | target/",
      "user:user | 0644  | target/file.txt | target version\n",
    ],
  });

  // status: both sides exist with different content and no state → Conflict
  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
      conflict:         1
    `,
    stderr: "",
  });

  // diff: shows unified diff comparing source vs target
  const testDir = getTestDir(t);
  await testbed.setMtime("source/file.txt", knownDate);
  await testbed.setMtime("target/file.txt", knownDate);

  await testbed.run({ args: ["--config", "config.toml", "diff"], env: { TZ: "UTC" } });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      === file.txt (CONFLICT) ===
      --- ${testDir.pathname}source/file.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
      +++ ${testDir.pathname}target/file.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
      @@ -1 +1 @@
      -source version
      +target version
    `,
    stderr: "",
  });

  // sync (no -i): aborts with conflict error
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 1,
    stdout: "",
    stderr: deindent`
      Conflicts detected (1 files):
        file.txt
      Error: Aborting due to 1 conflict(s). Use -i/--interactive to resolve.
    `,
  });

  // After abort: files unchanged, no state file created
  assertEquals(await testbed.readTestDir(), [
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | source version\n",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/file.txt | target version\n",
  ]);
});
