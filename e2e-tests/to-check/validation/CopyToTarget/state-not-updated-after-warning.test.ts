import {
  CONFIG_TOML,
  deindent,
  rootOwner,
  runningOutsideDocker,
  STATE_FILE,
  TestBed,
} from "@/lib/index.ts";

Deno.test({
  name: "state-should-not-be-updated-after-warning",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      owner = "${rootOwner}"
      globs = ["**/*.conf"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.conf | v1",
      "user:user | 755 | 0 | target/",
      "root:root | 644 | 0 | target/file.conf | v1",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  testbed.advance("1 sec");
  await testbed.chown("target/file.conf", "user:user");
  await testbed.writeTextFile("source/file.conf", "v2");

  // First sync: both source content and target owner changed → Conflict
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 1,
    stdout: "",
    stderr: deindent`
      Conflicts detected (1 files):
        file.conf
      Error: Aborting due to 1 conflict(s). Use -i/--interactive to resolve.
    `,
  });

  // Second sync: conflict persists because state was not updated after abort
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 1,
    stdout: "",
    stderr: deindent`
      Conflicts detected (1 files):
        file.conf
      Error: Aborting due to 1 conflict(s). Use -i/--interactive to resolve.
    `,
  });
});
