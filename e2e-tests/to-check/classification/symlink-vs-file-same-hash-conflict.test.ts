import { CONFIG_TOML, deindent, TestBed } from "@/lib/index.ts";

Deno.test("symlink-vs-file-same-hash-detected-as-conflict", async (t) => {
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
      "user:user | 644 | 0 | target/link.txt | hello",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  // status: source has symlink link.txt -> "hello", target has regular file with content "hello"
  // Same hash but different types → Conflict
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

  // sync (no -i): aborts with conflict error
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 1,
    stdout: "",
    stderr: deindent`
      Conflicts detected (1 files):
        link.txt
      Error: Aborting due to 1 conflict(s). Use -i/--interactive to resolve.
    `,
  });

  // Files unchanged, no state file
  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user |     | 0 | source/link.txt -> hello",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/link.txt | hello",
  ]);
});
