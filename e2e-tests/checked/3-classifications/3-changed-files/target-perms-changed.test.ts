import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("target-perms-changed-copy-to-source", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | hello",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | hello",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  testbed.advance("1 sec");
  await testbed.chmod("target/file.txt", 0o600);

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 1
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "status", "--short"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      1←
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "diff"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      === file.txt (target -> source) ===
      --- ${testDir}/target/file.txt${"\t"}2020-01-01 00:00:01.000000000 +0000
      +++ ${testDir}/source/file.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied target -> file.txt

      source -> target: 0
      target -> source: 1
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 600 | 0 | source/file.txt | hello",
    "user:user | 755 | 0 | target/",
    "user:user | 600 | 0 | target/file.txt | hello",
  ]);
});
