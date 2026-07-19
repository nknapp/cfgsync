import { parseDuration } from "./parseDuration.ts";

export class FakeTime {
  file: string;
  now: Date;

  constructor(now: Date) {
    this.now = now;
    this.file = Deno.makeTempFileSync({ prefix: "cfgsync-faketime-" });
    this.writeFakeTimeFile();
  }

  writeFakeTimeFile() {
    Deno.writeTextFileSync(this.file, String(this.now.getTime()));
  }

  advance(duration: string): void {
    const millis = parseDuration(duration);
    this.now = new Date(this.now.getTime() + millis);
    this.writeFakeTimeFile();
  }
}
