import {
  CONFIG_TOML_PLACEHOLDER,
  groupToId,
  TestGroup,
  TestSpec,
  TestUser,
  userToId,
} from "./config.ts";
import { parseDuration } from "./parseDuration.ts";

export async function setupTestDir(
  testDir: URL,
  spec: TestSpec,
): Promise<void> {
  await new SetupTestDir(testDir, spec).run();
}

class SetupTestDir {
  constructor(private testDir: URL, private spec: TestSpec) {}

  async run(): Promise<void> {
    try {
      await Deno.remove(this.testDir, { recursive: true });
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        throw e;
      }
    }
    await Deno.mkdir(this.testDir, { recursive: true });

    const factories = this.spec.files.map((line) => this.createFactory(line));
    factories.sort((a, b) => a.order - b.order);

    for (const factory of factories) {
      await factory.create();
    }
  }

  createFactory(line: string): Factory {
    const parts = line.split(" | ");
    const [owner, perms, mtimeStr, path, contents] = parts;

    assertNotNull(owner, "owner must not be null");
    assertNotNull(perms, "perms must not be null");
    assertNotNull(path, "path must not be null");
    const [user, group] = owner.split(":");
    const uid = userToId(user as TestUser);
    const gid = groupToId(group as TestGroup);
    const testDir = this.testDir;

    const mtime = this.computeMtime(mtimeStr);

    const baseInit: BaseFactoryInit = {
      testDir,
      path,
      mtime,
      perms,
      gid,
      uid,
    };

    if (path.endsWith("/")) {
      return new DirectoryFactory(baseInit);
    }
    if (path.includes(" -> ")) {
      return new SymlinkFactory(baseInit);
    }
    if (contents == CONFIG_TOML_PLACEHOLDER) {
      return new FileFactory({ ...baseInit, contents: this.spec.configToml });
    }
    return new FileFactory({ ...baseInit, contents });
  }

  computeMtime(mtimeStr: string): Date {
    const base = this.spec.faketime ? new Date(this.spec.faketime) : new Date();
    return new Date(base.getTime() + parseDuration(mtimeStr));
  }
}

interface Factory {
  readonly order: number;
  create(): Promise<void>;
}

interface BaseFactoryInit {
  testDir: URL;
  path: string;
  uid: number;
  gid: number;
  perms: string;
  mtime: Date;
}

interface DirectoryFactoryInit extends BaseFactoryInit {}

class DirectoryFactory implements Factory {
  constructor(private init: DirectoryFactoryInit) {}

  readonly order = 0;

  async create() {
    const realPath = new URL(this.init.path, this.init.testDir);
    await Deno.mkdir(realPath);
    await Deno.utime(realPath, this.init.mtime, this.init.mtime);
    await Deno.chmod(realPath, parseInt(this.init.perms, 8));
    await setOwner(realPath, this.init.uid, this.init.gid);
  }
}

interface FileFactoryInit extends BaseFactoryInit {
  contents: string;
}

class FileFactory implements Factory {
  readonly order = 0;

  constructor(private init: FileFactoryInit) {
    assertNotNull(
      init.contents,
      "contents must not be null if path does not end with '/'",
    );
  }

  async create() {
    const realPath = new URL(this.init.path, this.init.testDir);
    await Deno.create(realPath);
    await Deno.writeTextFile(realPath, this.init.contents);
    await Deno.utime(realPath, this.init.mtime, this.init.mtime);
    await Deno.chmod(realPath, parseInt(this.init.perms, 8));
    await setOwner(realPath, this.init.uid, this.init.gid);
  }
}

interface SymlinkFactoryInit extends BaseFactoryInit {
}

class SymlinkFactory implements Factory {
  readonly order = 0;

  constructor(private init: SymlinkFactoryInit) {}

  async create() {
    const [sourcePath, targetPath] = this.init.path.split(" -> ");
    const absoluteSourcePath = new URL(encodeURI(sourcePath), this.init.testDir);
    await Deno.symlink(targetPath, absoluteSourcePath);
    // Deno.utime does not work for symlinks because it sets the time of the link target.
    await Deno.spawnAndWait("touch", {
      args: ["-h", "-d", this.init.mtime.toISOString(), absoluteSourcePath.pathname],
    });
  }
}

function assertNotNull<T>(
  value: T | null | undefined,
  message: string,
): asserts value is T {
  if (value == null) {
    throw new Error(message);
  }
}

async function setOwner(realPath: URL, uid: number, gid: number) {
  if (Deno.uid() === 0) {
    await Deno.chown(realPath, uid, gid);
  } else if (uid !== Deno.uid() || gid !== Deno.gid()) {
    await Deno.spawnAndWait("sudo", ["chown", `${uid}:${gid}`, realPath.pathname]);
  }
}
