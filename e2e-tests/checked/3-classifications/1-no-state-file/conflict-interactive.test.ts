import { assertEquals, CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("interactive-conflict-choose-source", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | source version\n",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | target version\n",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  const child = testbed.spawn({ args: ["--config", "config.toml", "sync", "-i"] });
  await child.waitForStderr("Overwrite [t]arget   Overwrite [s]ource   [x]skip  [q]uit:");
  await child.type("s\n");
  const { code, stdout } = await child.waitForExit();

  assertEquals(
    stdout,
    deindent`
      resolved: file.txt (kept target)
  
      source -> target: 0
      target -> source: 1
      deleted target:   0
      deleted source:   0
      conflicts:        1
        resolved:       1
        skipped:        0
  `,
  );

  assertEquals(code, 0);

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | target version\n",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | target version\n",
  ]);
});

Deno.test("interactive-conflict-choose-target", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | source version\n",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | target version\n",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  const child = testbed.spawn({ args: ["--config", "config.toml", "sync", "-i"] });
  await child.waitForStderr("Overwrite [t]arget   Overwrite [s]ource   [x]skip  [q]uit:");
  await child.type("t\n");
  const { code, stdout } = await child.waitForExit();

  assertEquals(
    stdout,
    deindent`
    resolved: file.txt (kept source)

    source -> target: 1
    target -> source: 0
    deleted target:   0
    deleted source:   0
    conflicts:        1
      resolved:       1
      skipped:        0
  `,
  );

  assertEquals(code, 0);

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | source version\n",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | source version\n",
  ]);
});

Deno.test("interactive-conflict-skip", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | source version\n",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | target version\n",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  const child = testbed.spawn({ args: ["--config", "config.toml", "sync", "-i"] });
  await child.waitForStderr("Overwrite [t]arget   Overwrite [s]ource   [x]skip  [q]uit:");
  await child.type("x\n");
  const { code, stdout } = await child.waitForExit();

  assertEquals(
    stdout,
    deindent`
    skipped conflict: file.txt

    source -> target: 0
    target -> source: 0
    deleted target:   0
    deleted source:   0
    conflicts:        1
      resolved:       0
      skipped:        1
  `,
  );

  assertEquals(code, 0);

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | source version\n",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | target version\n",
  ]);

  // nothing has changed. State for this file should not have been updated, conflict is still there
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
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
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
