import { assertEquals, deindent, TestBed } from "@/lib/index.ts";

Deno.test("interactive-skip-conflict", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/conflict.txt | source version",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/conflict.txt | target version",
    ],
  });

  const child = testbed.spawn({ args: ["--config", "config.toml", "sync", "-i"] });
  await child.waitForStderr("Overwrite [t]arget   Overwrite [s]ource   [x]skip  [q]uit:");
  await child.type("x\n");
  const { code, stdout } = await child.waitForExit();

  assertEquals(
    stdout,
    deindent`
    skipped conflict: conflict.txt

    source -> target: 0
    target -> source: 0
    deleted target:   0
    deleted source:   0
    conflicts:        1
      resolved:       1
      skipped:        0
  `,
  );

  assertEquals(code, 0);

  assertEquals(await testbed.readTestDir(), [
    "user:user | 644 | 0 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/conflict.txt | source version",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/conflict.txt | target version",
  ]);
});

Deno.test("interactive-quit-conflict", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/conflict.txt | source version",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/conflict.txt | target version",
    ],
  });

  const child = testbed.spawn({ args: ["--config", "config.toml", "sync", "-i"] });
  await child.waitForStderr("Overwrite [t]arget   Overwrite [s]ource   [x]skip  [q]uit:");
  await child.type("q\n");
  const { code, stdout } = await child.waitForExit();

  assertEquals(stdout, "Aborting sync (1 conflicts remaining).\n");
  assertEquals(code, 1);
});
