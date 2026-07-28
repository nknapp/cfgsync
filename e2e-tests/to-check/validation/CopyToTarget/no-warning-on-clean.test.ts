import { CONFIG_TOML, deindent, rootOwner, TestBed } from "@/lib/index.ts";

Deno.test("no-owner-warning-on-clean", async (t) => {
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
      "user:user | 644 | 0 | source/file.conf | some content",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.conf -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
      permission skips: 1
    `,
    stderr: deindent`
      Owner warning: 'file.conf' should be owned by '${rootOwner}' (run as root to fix)
    `,
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
});
