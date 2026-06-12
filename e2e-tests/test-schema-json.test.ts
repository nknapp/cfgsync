import { assertEquals } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("schema-json", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: [
      "[[sync]]",
      'source = "./source"',
      'target = "./target"',
      'globs = ["**/*.txt"]',
    ].join("\n"),
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0755  | target/",
    ],
  });

  await testbed.run({ args: ["schema", "--json"] });

  // Verify exit code 0, no stderr, stdout is valid JSON
  const raw = (testbed as unknown as {
    lastRun: { code: number; stdout: string; stderr: string };
  }).lastRun;
  assertEquals(raw.code, 0);
  assertEquals(raw.stderr, "");

  const parsed = JSON.parse(raw.stdout);
  assertEquals(parsed.title, "Config");
  assertEquals(parsed.type, "object");
  assertEquals(parsed.required.includes("sync"), true);
  assertEquals(typeof parsed["$defs"], "object");
});
