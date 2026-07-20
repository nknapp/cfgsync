import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("sync-symlink-forward", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user |     | 0 | source/link.txt -> hello",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied link.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user |     | 0 | source/link.txt -> hello",
    "user:user | 755 | 0 | target/",
    "user:user |     | 0 | target/link.txt -> hello",
  ]);
});

Deno.test("sync-symlink-forward-replaces-file", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/link.txt | hello",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/link.txt | hello",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  // Both sides have a regular file with the same content; state tracks them as files.
  // Replace the source file with a symlink pointing to "hello".
  testbed.advance("1 sec");
  await testbed.deleteFile("source/link.txt");
  await Deno.symlink("hello", `${testDir}/source/link.txt`);

  // Sync detects the type change (file -> symlink) and copies to target
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied link.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  // Both sides now have the symlink
  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user |     | 0 | source/link.txt -> hello",
    "user:user | 755 | 0 | target/",
    "user:user |     | 0 | target/link.txt -> hello",
  ]);
});
