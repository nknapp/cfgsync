#!/usr/bin/env -S deno run --allow-run --allow-read --allow-env

import ms from "npm:ms";

const WORK_DIR = Deno.cwd();

const PROJECT = WORK_DIR.split("/").filter(Boolean).pop() || "unknown";

type Dep = Record<string, unknown>;
type Update = Record<string, unknown>;
type PkgFile = Record<string, unknown>;

function loadDotEnv(path: string): void {
    try {
        const content = Deno.readTextFileSync(path);
        for (const line of content.split("\n")) {
            const match = line.match(/^(\w+)=(.*)/);
            if (match) {
                const val = match[2].trim();
                if (val) Deno.env.set(match[1], val);
            }
        }
        const ghToken = Deno.env.get("GITHUB_TOKEN");
        if (ghToken) {
            Deno.env.set("GITHUB_COM_TOKEN", ghToken);
        }
    } catch {
        // .env is optional
    }
}

async function runRenovate(): Promise<Record<string, unknown>> {
    const env: Record<string, string> = {
        RENOVATE_LOG_FORMAT: "json",
        LOG_LEVEL: "debug",
    };
    const token = Deno.env.get("GITHUB_COM_TOKEN");
    if (token) env.GITHUB_COM_TOKEN = token;

    const cmd = new Deno.Command("npx", {
        args: ["--yes", "renovate", "--platform=local", "--dry-run=full"],
        cwd: WORK_DIR,
        env,
        stdout: "piped",
        stderr: "inherit",
    });

    const { stdout } = await cmd.output();
    const output = new TextDecoder().decode(stdout);

    for (const line of output.split("\n")) {
        if (line.includes('"msg":"packageFiles with updates"')) {
            return JSON.parse(line);
        }
    }
    throw new Error("Renovate did not produce packageFiles output");
}

function extractOutdated(config: Record<string, unknown>): Record<string, Dep[]> {
    const raw: Record<string, Dep[]> = {};

    for (const [manager, files] of Object.entries(config)) {
        if (!raw[manager]) raw[manager] = [];

        for (const pkgFile of (files as PkgFile[])) {
            const deps = pkgFile.deps as Dep[] | undefined;
            if (!deps) continue;

            for (const dep of deps) {
                const updates = dep.updates as Update[] | undefined;
                if (!updates || updates.length === 0) continue;
                if (dep.skipReason) continue;

                for (const update of updates) {
                    raw[manager].push({
                        name: dep.depName || dep.packageName,
                        package_file: pkgFile.packageFile || "",
                        current_value: dep.currentValue,
                        current_version: dep.currentVersion || dep.lockedVersion || "",
                        new_version: update.newVersion,
                        new_value: update.newValue,
                        update_type: update.updateType,
                        is_breaking: update.isBreaking,
                        version_age_days: update.newVersionAgeInDays,
                        release_timestamp: update.releaseTimestamp || null,
                    });
                }
            }
        }
    }

    // Deduplicate by name + new_version and remove empty managers
    const result: Record<string, Dep[]> = {};
    for (const [manager, deps] of Object.entries(raw)) {
        const seen = new Set<string>();
        const unique: Dep[] = [];
        for (const dep of deps) {
            const key = `${dep.name}|${dep.new_version}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(dep);
            }
        }
        if (unique.length > 0) {
            result[manager] = unique;
        }
    }

    return result;
}

async function main(): Promise<void> {
    loadDotEnv(`${WORK_DIR}/.env`);

    const logEntry = await runRenovate();
    const raw = extractOutdated(logEntry.config as Record<string, unknown>);

    const renovateConfig = JSON.parse(Deno.readTextFileSync(`${WORK_DIR}/renovate.json`));
    const ageString = renovateConfig.minimumReleaseAge ?? "0";
    const ageMs = ms(ageString);
    const minAgeDays = Math.round(ageMs / (1000 * 60 * 60 * 24));

    const outdated: Record<string, Dep[]> = {};
    for (const [manager, deps] of Object.entries(raw)) {
        const filtered = deps.filter((d) => d.version_age_days >= minAgeDays);
        if (filtered.length > 0) outdated[manager] = filtered;
    }

    const result = {
        project: PROJECT,
        generated_at: new Date().toISOString(),
        outdated,
    };

    console.log(JSON.stringify(result, null, 2));
}

main();
