import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("hooks-not-run-on-unchanged", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "touch ./target/hook-ran" }
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 755 | 0 | target/",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  await testbed.testStatus("config.toml", {
    short: deindent`
      ✓
    `,
    normal: deindent`
      source -> target: 0
      target -> source: 0
      all clean
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
    "user:user | 755 | 0 | target/",
  ]);
});
