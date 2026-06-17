# cfgsync Rename — Name Availability Report

**Date**: 2026-06-17
**Context**: `cfgsync` is already used by multiple other projects. This report
evaluates candidate replacement names across crates.io, npm, PyPI, GitHub, and
general web search (Brave).

---

## Evaluation criteria

A name is viable if it is:

1. **Free on crates.io** (hard requirement — this is a Rust project)
2. **Not taken on npm / PyPI** by any active project
3. **No significant GitHub project** (50+ stars) with the same name in a
   related domain
4. **Low search noise** — not dominated by unrelated brands, YouTube channels,
   or products
5. **Concise, memorable, and suggestive** of the tool's purpose

---

## Competitive landscape

During research, several projects surfaced that solve the same or adjacent
problems. This section documents what exists, to clarify cfgsync's
differentiation and ensure the new name avoids collision with direct
competitors.

### Same purpose, same name ("cfgsync")

Three other repos share the `cfgsync` name — all config-sync tools:

| Project               | Language | Stars |      Age | Notes                                          |
| --------------------- | :------: | ----: | -------: | ---------------------------------------------- |
| `jacekchmiel/cfgsync` | **Rust** |     0 | Apr 2022 | "Easy .config synchronization" — **archived**  |
| `gs-rezaem/cfgsync`   | Unknown  |     2 | Oct 2016 | "Sync configuration settings between machines" |
| `yanlinlin82/cfgsync` |  Shell   |     0 | Mar 2015 | "Sync configure files between machines"        |

None have meaningful traction, but the name is undifferentiated in the problem
space — multiple people independently chose it for the same purpose.

### Same purpose, different name (direct competitors)

These tools perform bidirectional file/directory sync with state tracking,
conflict detection, or similar mechanisms:

| Project                 | Language | Stars |      Age | Notes                                                                                                                      |
| ----------------------- | :------: | ----: | -------: | -------------------------------------------------------------------------------------------------------------------------- |
| `thebeebs/twosync`      |  Swift   |     0 | Mar 2026 | "Two-way folder sync for macOS — CLI + SwiftUI app." Tracks state, detects conflicts. **Direct competitor.**               |
| `khadyyade/duoSync`     |  Python  |     0 | Jun 2025 | "Lightweight CLI tool to safely synchronize files between two folders, ideal for dual-boot users."                         |
| `davirtavares/bidisync` |  Python  |     0 | Feb 2015 | Bidirectional sync demo for Cassandra↔Elasticsearch. Same concept, different tech (databases, not files). Dead since 2021. |

### Adjacent space: dotfile managers

These tools manage dotfiles but use a fundamentally different model — typically
symlinks from a version-controlled repo into `$HOME`. They are one-directional
(repo → home), not bidirectional with mtime-based state tracking and conflict
resolution:

| Project               | Language | Stars | Notes                                                          |
| --------------------- | :------: | ----: | -------------------------------------------------------------- |
| `utcq/dotmate`        | **Rust** |     1 | "Yes, Another dotfiles manager"                                |
| `krysiuda/dotmate`    |  Shell   |     0 | "Dotmate helps you manage dotfiles"                            |
| `LeslieLeung/dotmate` |  Python  |    13 | Active dotfile manager, last updated Mar 2026                  |
| dotmate.vercel.app    | Next.js  |     — | Live SaaS dotfile management dashboard                         |
| **chezmoi**           |    Go    |  14K+ | Industry-standard dotfile manager. Templated, one-directional. |
| **yadm**              |   Bash   |   5K+ | Git-based dotfile manager. One-directional.                    |
| **GNU Stow**          |   Perl   |     — | Symlink farm manager. One-directional, no state tracking.      |
| **dotbot**            |  Python  |   7K+ | Bootstrap dotfiles via YAML config. One-directional.           |

### Differentiation

cfgsync's niche remains open:

- **Bidirectional sync** between source and target directories (e.g.,
  version-controlled dotfiles ↔ `/etc`), not just repo-to-home deployments
- **Mtime-based state tracking** to detect changes on either side since last
  sync
- **Interactive conflict resolution** when both sides have changed
- **Permission/ownership enforcement** when run as root
- **Multi-group configuration** with per-glob permissions and hooks

The closest direct competitors (`twosync`, `duoSync`) are zero-star projects.
The well-known dotfile managers (chezmoi, yadm, GNU Stow) address a different
use case entirely. No established tool occupies cfgsync's exact position.

---

## Phase 1: Pure English metaphor words

These were derived from the tool's core metaphors: mirroring (doppelgänger),
safe storage (trove, coffer), balance (poise), weaving (braid), controlled flow
(sluice), connection (tether), trail-marking (cairn), harmony (attune), and
grafting (graft).

### Results: ALL TAKEN on crates.io

| Name     | crates.io status |  Downloads | Description                                |
| -------- | :--------------: | ---------: | ------------------------------------------ |
| `trove`  |     ❌ Taken     |     11,285 | Arena allocator                            |
| `coffer` |     ❌ Taken     |      2,927 | Java class file reader                     |
| `doppel` |     ❌ Taken     |         63 | Secret interceptor                         |
| `tether` |     ❌ Taken     |     16,331 | Web views                                  |
| `poise`  |     ❌ Taken     |    481,052 | Discord bot framework                      |
| `cairn`  |     ❌ Taken     |         30 | Build-gated version control (experimental) |
| `attune` |     ❌ Taken     |         43 | Mutable config for Rust                    |
| `braid`  |     ❌ Taken     |        129 | Issue tracker                              |
| `sluice` |     ❌ Taken     | 15,398,033 | Ring buffer / FIFO queues                  |
| `graft`  |     ❌ Taken     |     12,788 | Storage engine / JSON tree builder         |

**Lesson**: Pure English words are a dead end for crates.io. Even obscure words
(`sluice`, `cairn`) are already claimed.

### Additional web search findings (for completeness)

Even ignoring crates.io, most of these names carry heavy baggage elsewhere:

| Name     | Web/npm/PyPI                                                                                                  | GitHub                                       |
| -------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `trove`  | OpenStack Trove (DBaaS, active PyPI), Trove Recommerce (trove.com), Microsoft Trove (AI data), game mod tools | 3,282 repos                                  |
| `coffer` | Several small finance apps (coffer.to, getcoffer.app), dead npm/PyPI packages                                 | 1,266 repos                                  |
| `doppel` | Dead npm/PyPI packages, no active software                                                                    | 1,302 repos (mostly "doppelganger" variants) |
| `tether` | **Massive**: Tether.js (289K weekly npm downloads), Tether (USDT) cryptocurrency — name is radioactive        | 2,998 repos                                  |
| `poise`  | Dominated by `serenity-rs/poise` Rust crate (888 stars), Chef cookbooks archived                              | 877 repos                                    |
| `cairn`  | Dead React Native npm package, mostly TTRPG (Cairn RPG system)                                                | Rate-limited                                 |
| `attune` | Active npm code-quality CLI, active PyPI spectroscopy tool, AttuneOps IT company                              | Rate-limited                                 |
| `braid`  | Braid HTTP protocol (IETF draft), Redwood database (917 stars). npm is FREE (404).                            | Rate-limited                                 |
| `sluice` | Dead npm placeholder (0 stars, empty). Essentially clean on web.                                              | 1 repo (engineering simulator)               |
| `graft`  | Dead npm microservices lib, Perl graft package manager (still mirrored), AI agent frameworks                  | 9 repos                                      |

---

## Phase 2: Earlier alternatives (rejected)

| Name      | crates.io | Problem                                                                                                                                   |
| --------- | :-------: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `twosync` |  ✅ Free  | 177K-follower YouTube duo dominates search; couples relationship app exists                                                               |
| `convey`  | ❌ Taken  | Saturated: npm, PyPI, multiple GitHub orgs, HashiCorp ecosystem                                                                           |
| `confair` |  ✅ Free  | `magnars/confair` Clojure config lib (30 stars, active, same domain); medical billing company                                             |
| `duosync` |  ✅ Free  | Multiple apps (couples question app, period tracker), Portuguese software company, trademarked motorcycle intercom                        |
| `synkd`   |  ✅ Free  | Three separate businesses: London analytics company, iOS metronome app (since 2016), landscaping media company (2,640 LinkedIn followers) |
| `synq`    | ❌ Taken  | Squatted April 2026 by `m-epasta` (facade crate, 25 downloads)                                                                            |

---

## Phase 3: Prefixed/metaphor compounds (crates.io check)

| Name             | crates.io | Notes                                   |
| ---------------- | :-------: | --------------------------------------- |
| `syncade`        |  ✅ Free  | Made-up word: sync + arcade/cascade     |
| `flectr`         |  ✅ Free  | From "reflect" — mirror metaphor        |
| `dotloom`        |  ✅ Free  | "Loom" that weaves dotfiles             |
| **`cfgtrove`**   |  ✅ Free  | Treasure trove of configs               |
| **`dotcoffer`**  |  ✅ Free  | Strongbox for dotfiles                  |
| **`doppelsync`** |  ✅ Free  | Doppelgänger sync — mirror metaphor     |
| **`dotbraid`**   |  ✅ Free  | Braiding dotfiles together              |
| `bidisync`       |  ✅ Free  | Bidirectional sync — technical, precise |
| **`cfgflux`**    |  ✅ Free  | Config in flux/motion                   |
| `dotmate`        |  ✅ Free  | ⚠️ Contaminated (see Phase 4)           |
| `cfgkeep`        |  ✅ Free  | "Keep" — castle keep or to maintain     |
| `dotsafe`        |  ✅ Free  | Literal: dotfiles safe                  |
| `wainsync`       |  ✅ Free  | "Wain" (wagon) — carries files          |
| `weftsync`       |  ✅ Free  | "Weft" — weaving thread                 |

---

## Phase 4: Full search on top 8 compounds

These 8 were checked against npm, PyPI, GitHub, and general web search.

### Completely clean (0 repos, 0 registries, 0 search results)

| Name             | Metaphor                                               | crates.io | npm | PyPI | GitHub  |
| ---------------- | ------------------------------------------------------ | :-------: | :-: | :--: | :-----: |
| **`cfgtrove`**   | Treasure trove of configs. Safe storage.               |    ✅     | ✅  |  ✅  | 0 repos |
| **`cfgflux`**    | Config in controlled flux/motion.                      |    ✅     | ✅  |  ✅  | 0 repos |
| **`doppelsync`** | Target is the doppelgänger of source. Mirror metaphor. |    ✅     | ✅  |  ✅  | 0 repos |
| **`dotbraid`**   | Braids source and target together. Weaving metaphor.   |    ✅     | ✅  |  ✅  | 0 repos |
| **`dotcoffer`**  | Strongbox / chest for your dotfiles. Safe storage.     |    ✅     | ✅  |  ✅  | 0 repos |

### Lightly used (non-blocking)

| Name       | Risk                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dotloom`  | One dead GitHub Pages site from 2018 (`salmanahmedshaikh/dotloom.github.io` — returns 404). No registries taken.                                                                  |
| `bidisync` | One dead Python demo repo from 2015 (`davirtavares/bidisync` — Cassandra/Elasticsearch bidirectional sync, 0 stars). Same problem domain but different tech. No registries taken. |

### Contaminated

| Name      | Why dead                                                                                                                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dotmate` | 8+ GitHub repos including **two dotfile managers** (one in Rust: `utcq/dotmate`), plus a live SaaS at `dotmate.vercel.app`. A GitHub **organization** `dotmate` exists, blocking the namespace. Same domain, same purpose — non-starter. |

---

## Phase 5: Non-English words

The tool's core metaphors — twin/mirror, treasure/safe-storage,
bridge/connection — were explored across Latin, Sanskrit, Turkish, Swahili,
Finnish, Hungarian, and Welsh.

### crates.io check

| Name       |     crates.io     | Language  | Means         |
| ---------- | :---------------: | --------- | ------------- |
| `geminus`  |      ✅ Free      | Latin     | twin, double  |
| `nidhi`    | ❌ Taken (232 dl) | Sanskrit  | treasure      |
| `setu`     | ❌ Taken (18 dl)  | Sanskrit  | bridge        |
| `custos`   | ❌ Taken (29K dl) | Latin     | guardian      |
| `tessera`  | ❌ Taken (277 dl) | Latin     | token, tile   |
| `pacha`    | ❌ Taken (9K dl)  | Swahili   | twin          |
| `aarre`    |      ✅ Free      | Finnish   | treasure      |
| `kincs`    |      ✅ Free      | Hungarian | treasure      |
| `ikiz`     |      ✅ Free      | Turkish   | twin          |
| `hazina`   |      ✅ Free      | Swahili   | treasure      |
| `trysor`   |      ✅ Free      | Welsh     | treasure      |
| `gemisync` |      ✅ Free      | Latin+Eng | gemini + sync |

6 of 12 free on crates.io. The other 6 eliminated.

### Full search on survivors

| Name           | Means               | crates.io | npm |   PyPI   |             GitHub              | Verdict      |
| -------------- | ------------------- | :-------: | :-: | :------: | :-----------------------------: | ------------ |
| **`aarre`**    | Finnish: treasure   |    ✅     | ✅  |    ✅    |     FREE (dead repos only)      | **CLEAN**    |
| **`kincs`**    | Hungarian: treasure |    ✅     | ✅  |    ✅    | FREE (Hungarian student repos)  | **CLEAN**    |
| **`ikiz`**     | Turkish: twin       |    ✅     | ✅  |    ✅    | FREE (Turkish projects, max 5★) | **CLEAN**    |
| **`hazina`**   | Swahili: treasure   |    ✅     | ✅  |    ✅    |          FREE (max 6★)          | **CLEAN**    |
| **`trysor`**   | Welsh: treasure     |    ✅     | ✅  |    ✅    |      FREE (10 dead repos)       | **CLEAN**    |
| **`gemisync`** | Gemini + sync       |    ✅     | ✅  |    ✅    |         FREE (0 repos)          | **CLEAN**    |
| `geminus`      | Latin: twin         |    ✅     | ✅  | ❌ Taken |     LIGHTLY USED (49 repos)     | Contaminated |

`geminus` is taken on PyPI by **Geminus.ai, Inc.** — a commercial AI digital
twin platform. Discarded.

### Rejected Phase 5 names

| Name      | Why dead                                                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nidhi`   | crates.io ❌ + 10,057 GitHub results (extremely common Indian name). Invisible in search.                                                                              |
| `setu`    | crates.io ❌ + npm/PyPI **both taken** by Setu (setu.co), a funded Indian fintech API company with maintained SDKs.                                                    |
| `custos`  | crates.io ❌ + GitHub claimed by `elftausend/custos` (77★, active Rust crate). npm/PyPI packages exist but are dead.                                                   |
| `tessera` | crates.io ❌ + npm/PyPI **both taken** (active tile server on npm, Graphite dashboard on PyPI). Historical semiconductor company (Tessera Tech → Adeia, NASDAQ: ADEA). |
| `pacha`   | crates.io ❌ + GitHub claimed by `pacha/vem-tabline` (163★, well-known Vim plugin). Pacha nightclub brand risk.                                                        |

---

## Phase 6: French words

French words were explored for treasure (coffre), mirror (miroir), twin
(jumeau), reflection (reflet), bridge (pont), connection (lien), braid (tresse),
shuttle (navette), guardian (gardien), safe (sauve), and harmony (accorde).

### crates.io check

| Name      |     crates.io     | Means              |
| --------- | :---------------: | ------------------ |
| `coffre`  |      ✅ Free      | chest, strongbox   |
| `miroir`  | ❌ Taken (989 dl) | mirror             |
| `lien`    | ❌ Taken (47 dl)  | link, bond         |
| `pont`    | ❌ Taken (4K dl)  | bridge             |
| `jumeau`  |      ✅ Free      | twin               |
| `reflet`  |      ✅ Free      | reflection         |
| `relais`  |      ✅ Free      | relay              |
| `tresse`  |      ✅ Free      | braid              |
| `navette` |      ✅ Free      | shuttle            |
| `gardien` |      ✅ Free      | guardian           |
| `sauve`   |      ✅ Free      | saved, safe        |
| `accorde` |      ✅ Free      | agreement, harmony |

9 of 12 free on crates.io.

### Full search on survivors

| Name          | Means               | crates.io |   npm    |   PyPI   |                 GitHub                  | Verdict      |
| ------------- | ------------------- | :-------: | :------: | :------: | :-------------------------------------: | ------------ |
| **`jumeau`**  | French: twin        |    ✅     |    ✅    |    ✅    | FREE (102 results, no exact match > 0★) | **CLEAN**    |
| **`tresse`**  | French: braid       |    ✅     |    ✅    |    ✅    |       FREE (149 results, max 1★)        | **CLEAN**    |
| **`navette`** | French: shuttle     |    ✅     |    ✅    |    ✅    |       FREE (145 results, max 5★)        | **CLEAN**    |
| **`sauve`**   | French: safe, saved |    ✅     |    ✅    |    ✅    |          FREE (no exact match)          | **CLEAN**    |
| **`accorde`** | French: harmony     |    ✅     |    ✅    |    ✅    |          FREE (no exact match)          | **CLEAN**    |
| `coffre`      | French: chest       |    ✅     | ❌ Taken |    ✅    |       LIGHTLY USED (421 results)        | ⚠️ See below |
| `gardien`     | French: guardian    |    ✅     | ❌ Taken |    ✅    |       FREE (276 results, max 6★)        | Lightly used |
| `reflet`      | French: reflection  |    ✅     | ❌ Taken |    ✅    |      CLAIMED (76★ `zalky/reflet`)       | Contaminated |
| `relais`      | French: relay       |    ✅     | ❌ Taken | ❌ Taken |       FREE (489 results, max 3★)        | Contaminated |

### Notable contamination

| Name      | Issue                                                                                                                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `coffre`  | npm package is **`coffre` v0.1.0** — "configuration files manager, copies predefined config files organized into presets." **Same domain, same purpose.** Even though dead (8 years old, ~2 dl/week), the exact name collision in the config management space makes it unusable. |
| `relais`  | npm: active encrypted tunnel client (v1.8.1, 28 releases). PyPI: active async streaming pipeline by **Giskard-AI** (v0.2.1, 2025). Two independent, maintained packages.                                                                                                         |
| `reflet`  | npm taken by Reflet Digital (company). GitHub: `zalky/reflet` at 76★ (Clojure, Re-frame + React tooling).                                                                                                                                                                        |
| `gardien` | npm: `gardien` v0.1.7 — established ACL/RBAC library with 16 versions over 4 years (2017-2021), Redis-backed. Niche but real.                                                                                                                                                    |

### Rejected Phase 6 names

| Name     | Why dead                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `miroir` | crates.io ❌. GitHub: `miroir-os` organization actively owns the namespace (560★ on `gabin`).                                 |
| `lien`   | crates.io ❌. npm: `lien` v4.0.0 — active web framework with **19 dependents**, 60 releases, 151 dl/week.                     |
| `pont`   | crates.io ❌. GitHub: **Alibaba `pont`** at 3,026★ (TypeScript data service layer). `mkeeter/pont` at 269★ (Rust board game). |

---

## Final consolidated ranking

### Tier 1: Metaphor compounds (cleanest)

| #   | Name             | Metaphor                    | crates.io | registries | GitHub  |
| --- | ---------------- | --------------------------- | :-------: | :--------: | :-----: |
| 1   | **`cfgtrove`**   | Treasure trove of configs   |    ✅     |  All free  | 0 repos |
| 2   | **`dotcoffer`**  | Strongbox for dotfiles      |    ✅     |  All free  | 0 repos |
| 3   | **`cfgflux`**    | Config in controlled motion |    ✅     |  All free  | 0 repos |
| 4   | **`dotbraid`**   | Braids two directories      |    ✅     |  All free  | 0 repos |
| 5   | **`doppelsync`** | Doppelgänger mirror         |    ✅     |  All free  | 0 repos |

### Tier 2: Non-English pure words

| #   | Name          | Language | Means    | crates.io | registries |    GitHub     |
| --- | ------------- | -------- | -------- | :-------: | :--------: | :-----------: |
| 6   | **`trysor`**  | Welsh    | treasure |    ✅     |  All free  | 10 dead repos |
| 7   | **`jumeau`**  | French   | twin     |    ✅     |  All free  |     Free      |
| 8   | **`tresse`**  | French   | braid    |    ✅     |  All free  |     Free      |
| 9   | **`aarre`**   | Finnish  | treasure |    ✅     |  All free  |     Free      |
| 10  | **`navette`** | French   | shuttle  |    ✅     |  All free  |     Free      |

### Tier 3: Compound non-English

| #   | Name           | Derivation     | Means     | crates.io | registries | GitHub  |
| --- | -------------- | -------------- | --------- | :-------: | :--------: | :-----: |
| 11  | **`gemisync`** | Gemini + sync  | twin sync |    ✅     |  All free  | 0 repos |
| 12  | **`sauve`**    | French sauve   | safe      |    ✅     |  All free  |  Free   |
| 13  | **`accorde`**  | French accorde | harmony   |    ✅     |  All free  |  Free   |
| 14  | **`kincs`**    | Hungarian      | treasure  |    ✅     |  All free  |  Free   |
| 15  | **`hazina`**   | Swahili        | treasure  |    ✅     |  All free  |  Free   |
| 16  | **`ikiz`**     | Turkish        | twin      |    ✅     |  All free  |  Free   |

---

## Recommendation

**`cfgtrove`** — strongest across all axes:

- **Metaphor**: A treasure trove implies something you deliberately curate, keep
  safe, and value. Your dotfiles/configs are personal and deserve that care.
- **Uniqueness**: Zero footprint anywhere across all 36 researched names — the
  only Tier 1 candidate with zero GitHub repos, zero registries taken, zero
  search noise.
- **Memorability**: Two syllables, 8 characters. The "cfg-" prefix is immediately
  recognized by the target audience (developers managing configs). "Trove" is a
  common English word with positive associations.
- **Pronunciation**: "config trove" — no ambiguity.
- **Future-proof**: The cfg- prefix + unique English compound makes accidental
  future collisions extremely unlikely.
- **crate name**: `cfgtrove` is available. Binary name: `cfgtrove`.

### Runner-up: `trysor`

If a more exotic, shorter name is preferred, **`trysor`** (Welsh for "treasure,"
6 chars) is the cleanest non-English candidate — zero registries taken, only 10
dead GitHub repos. Trade-off: non-obvious pronunciation ("TRUH-sor"?) and lacks
the config-domain anchor of the cfg- prefix.
