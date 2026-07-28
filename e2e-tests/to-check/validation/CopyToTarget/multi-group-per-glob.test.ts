import { CONFIG_TOML, deindent, nobodyOwner, rootOwner, TestBed } from "@/lib/index.ts";

Deno.test("per-glob-owner-and-permissions", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      owner = "${rootOwner}"
      file_perms = "public"
      globs = [
          "*.conf",
          { pattern = "override-perms.key", file_perms = "private" },
          { pattern = "override-owner.key", file_perms = "public", owner = "${nobodyOwner}" },
      ]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.conf | default perms and owner",
      "user:user | 644 | 0 | source/override-perms.key | per-glob perms override",
      "user:user | 644 | 0 | source/override-owner.key | per-glob owner override",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
      deleted target:   0
      deleted source:   0
      permission skips: 3
    `,
    stderr: deindent`
      Owner warning: 'file.conf' should be owned by '${rootOwner}' (run as root to fix)
      Owner warning: 'override-owner.key' should be owned by '${nobodyOwner}' (run as root to fix)
      Owner warning: 'override-perms.key' should be owned by '${rootOwner}' (run as root to fix)
    `,
  });
});
