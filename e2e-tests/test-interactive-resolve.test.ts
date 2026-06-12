import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("interactive-overwrite-target", async (t) => {
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
      "user:user | 0644  | source/conflict.txt | source version",
      "user:user | 0755  | target/",
      "user:user | 0644  | target/conflict.txt | target version",
    ],
  });

  const child = testbed.spawn({ args: ["--config", "config.toml", "sync", "-i"] });

  await child.waitForStderr("Overwrite [t]arget   Overwrite [s]ource   [x]skip  [q]uit:");
  await child.type("t\n");
  const { code, stdout } = await child.waitForExit();

  assertEquals(
    stdout,
    "resolved: conflict.txt (kept source)\n\nsource -> target: 1\n" +
      "target -> source: 0\ndeleted target:   0\ndeleted source:   0\n" +
      "conflicts:        1\n  resolved:       1\n  skipped:        0\n",
  );

  assertEquals(code, 0);

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/conflict.txt | source version",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/conflict.txt | source version",
  ]);
});

Deno.test("interactive-overwrite-source", async (t) => {
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
      "user:user | 0644  | source/conflict.txt | source version",
      "user:user | 0755  | target/",
      "user:user | 0644  | target/conflict.txt | target version",
    ],
  });

  const child = testbed.spawn({ args: ["--config", "config.toml", "sync", "-i"] });
  await child.waitForStderr("Overwrite [t]arget   Overwrite [s]ource   [x]skip  [q]uit:");
  await child.type("s\n");

  const { code, stdout } = await child.waitForExit();
  assertEquals(
    stdout,
    "resolved: conflict.txt (kept target)\n\nsource -> target: 0\n" +
      "target -> source: 1\ndeleted target:   0\ndeleted source:   0\n" +
      "conflicts:        1\n  resolved:       1\n  skipped:        0\n",
  );

  assertEquals(code, 0);

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/conflict.txt | target version",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/conflict.txt | target version",
  ]);
});
