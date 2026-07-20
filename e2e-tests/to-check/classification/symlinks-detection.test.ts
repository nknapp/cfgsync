import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("symlinks-status-detected", async (t) => {
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
      "user:user | 644 | 0 | source/file.txt | file content",
      "user:user |      | 0 | source/link.txt -> file.txt",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 2
      target -> source: 0
    `,
    stderr: "",
  });
});

Deno.test("symlinks-preserved-during-sync", async (t) => {
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
      "user:user | 644 | 0 | source/file.txt | file content",
      "user:user |      | 0 | source/link.txt -> file.txt",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      copied link.txt -> target

      source -> target: 2
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
    "user:user | 644 | 0 | source/file.txt | file content",
    "user:user |      | 0 | source/link.txt -> file.txt",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | file content",
    "user:user |      | 0 | target/link.txt -> file.txt",
  ]);
});
