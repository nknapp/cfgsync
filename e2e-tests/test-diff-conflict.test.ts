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
      "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | 0 | source/",
      "user:user | 0644 | -7200 sec | source/conflict.txt | line 1\nline 2\nline 3 source\n",
      "user:user | 0755 | 0 | target/",
      "user:user | 0644 | 0 | target/conflict.txt | line 1\nline 2\nline 3 target\n",
    ],
    faketime: "2026-05-20T15:00:00Z",
  });

  const testDir = getTestDir(t);

  await testbed.run({ args: ["--config", "config.toml", "diff"], env: { TZ: "UTC" } });
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

  await testbed.run({ args: ["--config", "config.toml", "diff"], env: { TZ: "Europe/Berlin" } });
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
