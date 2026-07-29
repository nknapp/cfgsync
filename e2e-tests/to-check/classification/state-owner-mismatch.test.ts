import { CONFIG_TOML, deindent, rootOwner, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("state-owner-mismatch-detected-as-changed", async (t) => {
  const { testbed, testDir, username, groupname } = await TestBed.create(t, {
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
    faketime: "2010-01-01T10:00:00Z",
  });

  const statePath = `${testDir}/config.cfgsync.state`;
  const stateContent = await testbed.readTextFile("config.cfgsync.state");
  const actualOwner = `${username}:${groupname}`;
  const escapedOwner = actualOwner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const modified = stateContent.replace(
    new RegExp(`owner = "${escapedOwner}"`, "g"),
    `owner = "${rootOwner}"`,
  );
  await Deno.writeTextFile(statePath, modified);

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
      state update:     1
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "status", "--short"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      ↺1
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
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
    "user:user | 644 | 0 | source/file.txt | hello",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | hello",
  ]);
});
