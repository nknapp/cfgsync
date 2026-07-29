import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("both-perms-changed-same-update-state", async (t) => {
  const { testbed } = await TestBed.create(t, {
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
  await testbed.chmod("source/file.txt", 0o600);
  await testbed.chmod("target/file.txt", 0o600);

  await testbed.testStatus("config.toml", {
    short: deindent`
      ↺1
    `,
    normal: deindent`
      source -> target: 0
      target -> source: 0
      state update:     1
    `,
  });

  await testbed.testDiff("config.toml", "");

  await testbed.testSync("config.toml", {
    code: 0,
    stdout: deindent`
      source -> target: 0
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
    "user:user | 600 | 0 | source/file.txt | hello",
    "user:user | 755 | 0 | target/",
    "user:user | 600 | 0 | target/file.txt | hello",
  ]);
});
