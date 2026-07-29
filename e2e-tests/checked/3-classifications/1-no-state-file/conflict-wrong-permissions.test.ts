import { CONFIG_TOML, deindent, rootOwner, TestBed } from "@/lib/index.ts";

// One file in source and in target, no state file, both files have equal content but different permissions
// (after applying configured owner)
Deno.test("conflict-no-state different owner", async (t) => {
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
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.conf | v1",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.conf | v1",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  testbed.advance("1 sec");

  await testbed.testStatus("config.toml", {
    short: deindent`
      1↯
    `,
    normal: deindent`
      source -> target: 0
      target -> source: 0
      conflict:         1
    `,
  });

  // sync (no -i): aborts with conflict error
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

  // After abort: files unchanged, no state file created
  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.conf | v1",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.conf | v1",
  ]);
});
