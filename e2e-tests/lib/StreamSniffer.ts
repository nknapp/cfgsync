class UpdateEvent extends Event {
  constructor() {
    super("update");
  }
}

class CloseEvent extends Event {
  constructor() {
    super("close");
  }
}

export interface WaitForOptions {
  minCount?: number;
  timeoutMillis?: number;
}

export class StreamSniffer {
  readonly result: Promise<string>;
  private readonly listeners = new EventTarget();
  text = "";

  constructor(public name: string, stream: ReadableStream<string>) {
    this.result = this.run(stream);
  }

  private async run(stream: ReadableStream<string>): Promise<string> {
    try {
      for await (const chunk of stream) {
        this.text += chunk;
        this.listeners.dispatchEvent(new UpdateEvent());
      }
    } finally {
      this.listeners.dispatchEvent(new CloseEvent());
    }
    return this.text;
  }

  waitFor(needle: string | RegExp, { minCount = 1, timeoutMillis = 1000 }: WaitForOptions = {}) {
    if (this.checkNeedle(needle, minCount)) return Promise.resolve();
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    let done = false;
    const handler: EventListener = (event) => {
      if (event instanceof UpdateEvent) {
        if (this.checkNeedle(needle, minCount)) {
          this.listeners.removeEventListener("update", handler);
          if (done) return;
          done = true;
          resolve();
        }
      }
    };
    this.listeners.addEventListener("update", handler);
    this.listeners.addEventListener("close", () => {
      if (done) return;
      done = true;
      reject(
        new Error(
          `Error: Stream finished while waiting for '${needle}' (minCount: ${minCount}) on '${this.name}'. Found so far:\n${this.text}`,
        ),
      );
    }, { once: true });

    setTimeout(() => {
      this.listeners.removeEventListener("update", handler);
      if (done) return;
      done = true;
      reject(
        new Error(
          `Error: Timeout waiting for '${needle}' (minCount: ${minCount}) on '${this.name}'. Found so far:\n${this.text}`,
        ),
      );
    }, timeoutMillis);

    return promise;
  }

  private checkNeedle(needle: string | RegExp, minCount: number): boolean {
    return this.text.split(needle).length > minCount;
  }
}
