import { getTestDir } from "./lib/setupTestDir.ts";
import { deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("diff-conflict-shows-unified-diff", async (t) => {
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
      "user:user | 0644  | source/conflict.txt | line 1\nline 2\nline 3 source\n",
      "user:user | 0755  | target/",
      "user:user | 0644  | target/conflict.txt | line 1\nline 2\nline 3 target\n",
    ],
  });

  const testDir = getTestDir(t);
  await Deno.utime(
      new URL("source/conflict.txt", testDir),
      new Date("2026-05-20T13:00:00Z"),
      new Date("2026-05-20T13:00:00Z"),
  );
  await Deno.utime(
      new URL("target/conflict.txt", testDir),
      new Date("2026-05-20T15:00:00Z"),
      new Date("2026-05-20T15:00:00Z"),
  );

  await testbed.run({ args: ["diff", "config.toml"], env: { TZ: "UTC"} });
  testbed.assertOutput({
    code: 0,
    stderr: "",
    stdout: deindent`
      === conflict.txt (CONFLICT) ===
      --- ${testDir.pathname}source/conflict.txt${"\t"}2026-05-20 13:00:00.000000000 +0000
      +++ ${testDir.pathname}target/conflict.txt${"\t"}2026-05-20 15:00:00.000000000 +0000
      @@ -1,3 +1,3 @@
       line 1
       line 2
      -line 3 source
      +line 3 target
    `,
  });

  await testbed.run({ args: ["diff", "config.toml"], env: { TZ: "Europe/Berlin"} });
  testbed.assertOutput({
    code: 0,
    stderr: "",
    stdout: deindent`
      === conflict.txt (CONFLICT) ===
      --- ${testDir.pathname}source/conflict.txt${"\t"}2026-05-20 15:00:00.000000000 +0200
      +++ ${testDir.pathname}target/conflict.txt${"\t"}2026-05-20 17:00:00.000000000 +0200
      @@ -1,3 +1,3 @@
       line 1
       line 2
      -line 3 source
      +line 3 target
    `,
  });
});
