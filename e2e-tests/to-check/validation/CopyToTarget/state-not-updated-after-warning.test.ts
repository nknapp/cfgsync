import { CONFIG_TOML, deindent, rootOwner, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("state-not-updated-after-warning", async (t) => {
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
      "user:user | 644 | 0 | target/file.conf | v1",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  testbed.advance("1 sec");
  await testbed.writeTextFile("source/file.conf", "v2");

  // First sync: CopyToTarget but skipped due to owner feasibility
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
      deleted target:   0
      deleted source:   0
      permission skips: 1
    `,
    stderr: deindent`
      Owner warning: 'file.conf' should be owned by '${rootOwner}' (run as root to fix)
    `,
  });

  // Second sync: source still changed, should skip again
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
      deleted target:   0
      deleted source:   0
      permission skips: 1
    `,
    stderr: deindent`
      Owner warning: 'file.conf' should be owned by '${rootOwner}' (run as root to fix)
    `,
  });
});
