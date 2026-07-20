import { assertEquals, CONFIG_TOML, deindent, hash, TestBed } from "@/lib/index.ts";

Deno.test("permission-presets-state-records-mapped-perms", async (t) => {
  const { testbed, testDir, username, groupname } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      file_perms = "private"
      globs = ["**/*.conf"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.conf | some content",
      "user:user | 755 | 0 | target/",
    ],
    faketime: "2026-05-20T15:00:00Z",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  // State file should record the mapped target perms (600), not the raw source perms (644).
  const stateToml = await testbed.readTextFile("config.cfgsync.state");
  const expected = deindent`
    last_sync = "2026-05-20T15:00:00Z"

    [[file]]
    group = "${testDir}/target"
    path = "file.conf"
    hash = "${hash("some content")}"
    perms = "600"
    owner = "${username}:${groupname}"
    mtime = "2026-05-20T15:00:00.000Z"
  `;
  assertEquals(stateToml, expected);
});
