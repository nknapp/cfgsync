import { assert, assertEquals } from "./assert.ts";
import { spawn } from "./spawn.ts";

Deno.test("spawn no steps", async () => {
  const { code, stdout, stderr } = await spawn(
    new Deno.Command("echo", {
      args: ["hello", "world"],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }),
    [],
  );
  assertEquals(code, 0);
  assertEquals(stdout.trim(), "hello world");
  assertEquals(stderr, "");
});

Deno.test("spawn with interaction", async () => {
  const { code, stdout } = await spawn(
    new Deno.Command("sh", {
      args: ["-c", 'echo "choose [s/t]:"; read choice; echo "picked: $choice"'],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }),
    [{ match: /choose/, write: "s\n" }],
  );
  assertEquals(code, 0);
  assert(stdout.includes("picked: s"));
});
