import { CONFIG_TOML, deindent, runningOutsideDocker, TestBed } from "@/lib/index.ts";

Deno.test({
  name: "conflict-neither-direction-feasible",
  ignore: runningOutsideDocker,
}, async (t) => {
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
      "user:user | 400 | 0 | source/file.txt | source content",
      "user:user | 755 | 0 | target/",
      "user:user | 400 | 0 | target/file.txt | target content",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  await testbed.testStatus("config.toml", {
    short: deindent`
      ✗1
    `,
    normal: deindent`
      source -> target: 0
      target -> source: 0
      failed:           1
    `,
  });

  await testbed.testSync("config.toml", {
    code: 1,
    stdout: "",
    stderr: deindent`
      Conflicts detected (1 files):
        file.txt
      Error: Aborting due to 1 conflict(s). Use -i/--interactive to resolve.
    `,
  });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 400 | 0 | source/file.txt | source content",
    "user:user | 755 | 0 | target/",
    "user:user | 400 | 0 | target/file.txt | target content",
  ]);
});
