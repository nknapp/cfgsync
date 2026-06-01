import { StreamSniffer } from "./StreamSniffer.ts";
import { assertEquals } from "./assert.ts";

Deno.test("test-waitfor", async () => {
  const stream = new TransformStream<string>();
  const result: string[] = [];

  const sniffer = new StreamSniffer("testsniffer", stream.readable);

  sniffer.waitFor("some text", { minCount: 2 }).then(() => result.push("some-text 2"));
  sniffer.waitFor("some text").then(() => result.push("some-text 1"));
  sniffer.waitFor("some").then(() => result.push("some 1"));

  const writer = stream.writable.getWriter();

  await writer.write("so");
  assertEquals(result, []);

  await writer.write("me");
  assertEquals(result, ["some 1"]);

  await writer.write(" text");
  assertEquals(result, ["some 1", "some-text 1"]);

  await writer.write(" some text");
  assertEquals(result, ["some 1", "some-text 1", "some-text 2"]);

  await writer.close();
  assertEquals(await sniffer.result, "some text some text");
});

Deno.test("test with timeout", async () => {
  const stream = new TransformStream<string>();
  const result: string[] = [];
  const errors: string[] = [];

  const sniffer = new StreamSniffer("testsniffer", stream.readable);

  sniffer.waitFor("some text", { timeoutMillis: 10 }).then(
    () => result.push("some-text"),
    (error) => errors.push(error.message),
  );
  await stream.writable.getWriter().write("some");
  await wait(20);

  assertEquals(errors, [
    `Error: Timeout waiting for 'some text' (minCount: 1) on 'testsniffer'. Found so far:\nsome`,
  ]);
  assertEquals(result, []);
});

Deno.test("test with timeout (2 times)", async () => {
  const stream = new TransformStream<string>();
  const result: string[] = [];
  const errors: string[] = [];

  const sniffer = new StreamSniffer("testsniffer", stream.readable);

  sniffer.waitFor("some text", { timeoutMillis: 10, minCount: 2 }).then(
    () => result.push("some-text"),
    (error) => errors.push(error.message),
  );
  await stream.writable.getWriter().write("some text");
  await wait(20);

  assertEquals(errors, [
    `Error: Timeout waiting for 'some text' (minCount: 2) on 'testsniffer'. Found so far:\nsome text`,
  ]);
  assertEquals(result, []);
});

async function wait(timeoutMillis: number) {
  await new Promise((resolve) => setTimeout(resolve, timeoutMillis));
}
