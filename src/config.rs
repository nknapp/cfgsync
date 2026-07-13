use schemars::JsonSchema;
use serde::Deserialize;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct Config {
    #[schemars(
        description = "List of sync groups. Each group defines a source, target, and globs."
    )]
    pub sync: Vec<SyncGroup>,
}

#[derive(Debug, Deserialize, Clone, PartialEq, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum PermissionPreset {
    #[schemars(description = "source 644→600, 755→700 (most restrictive)")]
    Private,
    #[schemars(description = "source 644→664, 755→775")]
    Shared,
    #[schemars(description = "source 644→660, 755→770")]
    Group,
    #[schemars(description = "source 644→640, 755→750")]
    GroupRead,
    #[schemars(description = "source 644→644, 755→755 (default, no change)")]
    Public,
}

impl PermissionPreset {
    pub fn map_permissions(&self, source_mode: u32) -> u32 {
        let owner_perm = source_mode & 0o700;
        match self {
            PermissionPreset::Private => {
                if owner_perm == 0o700 {
                    0o700
                } else {
                    0o600
                }
            }
            PermissionPreset::Shared => {
                if owner_perm == 0o700 {
                    0o775
                } else {
                    0o664
                }
            }
            PermissionPreset::Group => {
                if owner_perm == 0o700 {
                    0o770
                } else {
                    0o660
                }
            }
            PermissionPreset::GroupRead => {
                if owner_perm == 0o700 {
                    0o750
                } else {
                    0o640
                }
            }
            PermissionPreset::Public => source_mode,
        }
    }

    #[allow(dead_code)]
    pub fn reverse_map_permissions(&self, target_mode: u32) -> u32 {
        match self {
            PermissionPreset::Public => target_mode,
            _ => {
                if (target_mode & 0o100) != 0 {
                    0o755
                } else {
                    0o644
                }
            }
        }
    }
}

#[derive(Debug, Default, Deserialize, Clone, JsonSchema)]
pub struct HooksConfig {
    #[schemars(
        description = "Shell command executed via /bin/sh after files are copied from source to target"
    )]
    #[serde(default)]
    pub after: Option<String>,
}

#[derive(Debug, Deserialize, Clone, JsonSchema)]
pub struct SyncGroup {
    #[schemars(description = "Path to the source directory (files are read from here)")]
    pub source: String,
    #[schemars(description = "Path to the target directory (files are written here)")]
    pub target: String,
    #[schemars(
        description = "Glob patterns defining which files to sync. Each entry is either a plain glob string or an object with per-glob overrides."
    )]
    #[serde(default)]
    pub globs: Vec<GlobEntry>,
    #[schemars(description = "Default file-permission preset applied to regular files in target")]
    #[serde(default)]
    pub file_perms: Option<PermissionPreset>,
    #[schemars(
        description = "Default directory-permission preset applied to directories in target"
    )]
    #[serde(default)]
    pub dir_perms: Option<PermissionPreset>,
    #[schemars(description = "Default owner (user:group) applied to synced files")]
    #[serde(default)]
    pub owner: Option<String>,
    #[schemars(description = "Hooks to run during sync")]
    #[serde(default)]
    pub hooks: HooksConfig,
    #[schemars(
        description = "Deviating directories with expected permissions/owner for validation"
    )]
    #[serde(default)]
    pub deviating: Vec<DeviatingEntry>,
}

#[derive(Debug, Deserialize, Clone, JsonSchema)]
pub struct DeviatingEntry {
    #[schemars(description = "Path to a directory (no glob) with expected permissions/owner")]
    pub path: String,
    #[schemars(description = "Optional expected permission for the directory")]
    #[serde(default)]
    pub permissions: Option<String>,
    #[schemars(description = "Optional expected owner for the directory")]
    #[serde(default)]
    pub owner: Option<String>,
}

#[derive(Debug, Deserialize, Clone, JsonSchema)]
#[serde(untagged)]
pub enum GlobEntry {
    #[schemars(description = "A plain glob string (e.g. \"**/*.conf\")")]
    Simple(String),
    #[schemars(
        description = "A detailed glob entry with optional per-glob permissions and owner overrides"
    )]
    Detailed {
        #[schemars(description = "The glob pattern (e.g. \"**/*.conf\")")]
        pattern: String,
        #[schemars(description = "Optional file-permission preset override for this glob")]
        #[serde(default)]
        file_perms: Option<PermissionPreset>,
        #[schemars(description = "Optional directory-permission preset override for this glob")]
        #[serde(default)]
        dir_perms: Option<PermissionPreset>,
        #[schemars(description = "Optional owner override for this glob (user:group)")]
        #[serde(default)]
        owner: Option<String>,
    },
}

#[derive(Debug)]
pub struct ResolvedConfig {
    #[allow(dead_code)]
    pub config_dir: PathBuf,
    pub config_path: PathBuf,
    pub sync_groups: Vec<ResolvedSyncGroup>,
    pub state_path: PathBuf,
}

#[derive(Debug)]
pub struct ResolvedSyncGroup {
    pub source_dir: PathBuf,
    pub target_dir: PathBuf,
    pub globs: Vec<ResolvedGlob>,
    #[allow(dead_code)]
    pub file_perms: Option<PermissionPreset>,
    #[allow(dead_code)]
    pub dir_perms: Option<PermissionPreset>,
    #[allow(dead_code)]
    pub owner: Option<String>,
    #[allow(dead_code)]
    pub deviating: Vec<ResolvedDeviatingEntry>,
    pub hook_after: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ResolvedGlob {
    #[allow(dead_code)]
    pub pattern: String,
    pub file_perms: Option<PermissionPreset>,
    #[allow(dead_code)]
    pub dir_perms: Option<PermissionPreset>,
    pub owner: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ResolvedDeviatingEntry {
    #[allow(dead_code)]
    pub path: PathBuf,
    #[allow(dead_code)]
    pub permissions: Option<u32>,
    #[allow(dead_code)]
    pub owner: Option<String>,
}

pub fn load_config(config_path: &Path) -> Result<ResolvedConfig, String> {
    let content = std::fs::read_to_string(config_path)
        .map_err(|e| format!("Cannot read config file '{}': {}", config_path.display(), e))?;

    let config: Config = toml::from_str(&content).map_err(|e| {
        if content.contains("source_dir") || content.contains("[[filter]]") {
            format!(
                "Invalid config: {}. The config format has changed — use [[sync]] groups instead. See 'cfgsync schema' for the new format.",
                e
            )
        } else {
            format!("Invalid config: {}", e)
        }
    })?;

    if config.sync.is_empty() {
        return Err("At least one [[sync]] group is required".to_string());
    }

    let config_dir = config_path
        .parent()
        .ok_or_else(|| "Config file has no parent directory".to_string())?
        .to_path_buf();

    let owner_home = config_owner_home(config_path)?;

    let mut sync_groups = Vec::new();

    for group in &config.sync {
        if group.globs.is_empty() {
            return Err("Each [[sync]] group must have at least one glob".to_string());
        }

        let source_dir = resolve_path(&config_dir, &expand_tilde(&group.source, &owner_home));
        let target_dir = resolve_path(&config_dir, &expand_tilde(&group.target, &owner_home));

        if !source_dir.is_dir() {
            return Err(format!(
                "source directory '{}' does not exist or is not a directory",
                source_dir.display()
            ));
        }
        if !target_dir.is_dir() {
            return Err(format!(
                "target directory '{}' does not exist or is not a directory",
                target_dir.display()
            ));
        }

        let source_dir = source_dir.canonicalize().map_err(|e| {
            format!(
                "Cannot resolve source directory '{}': {}",
                source_dir.display(),
                e
            )
        })?;
        let target_dir = target_dir.canonicalize().map_err(|e| {
            format!(
                "Cannot resolve target directory '{}': {}",
                target_dir.display(),
                e
            )
        })?;

        let globs: Vec<ResolvedGlob> = group
            .globs
            .iter()
            .map(|entry| {
                let (pattern, file_perms, dir_perms, owner) = match entry {
                    GlobEntry::Simple(p) => (p.clone(), None, None, None),
                    GlobEntry::Detailed {
                        pattern,
                        file_perms: fp,
                        dir_perms: dp,
                        owner,
                    } => (pattern.clone(), fp.clone(), dp.clone(), owner.clone()),
                };

                glob::Pattern::new(&pattern)
                    .map_err(|e| format!("Invalid glob '{}': {}", pattern, e))?;

                Ok(ResolvedGlob {
                    pattern,
                    file_perms: file_perms.or(group.file_perms.clone()),
                    dir_perms: dir_perms.or(group.dir_perms.clone()),
                    owner: owner.or_else(|| group.owner.clone()),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;

        let deviating: Vec<ResolvedDeviatingEntry> = group
            .deviating
            .iter()
            .map(|entry| {
                let perms = entry
                    .permissions
                    .as_deref()
                    .map(parse_permissions)
                    .transpose()?;
                let path = resolve_path(&config_dir, &expand_tilde(&entry.path, &owner_home));
                let path = path.canonicalize().unwrap_or(path);
                Ok(ResolvedDeviatingEntry {
                    path,
                    permissions: perms,
                    owner: entry.owner.clone(),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;

        sync_groups.push(ResolvedSyncGroup {
            source_dir,
            target_dir,
            globs,
            file_perms: group.file_perms.clone(),
            dir_perms: group.dir_perms.clone(),
            owner: group.owner.clone(),
            deviating,
            hook_after: group.hooks.after.clone(),
        });
    }

    let state_path = config_path.with_extension("cfgsync.state");

    Ok(ResolvedConfig {
        config_dir,
        config_path: config_path.to_path_buf(),
        sync_groups,
        state_path,
    })
}

fn parse_permissions(s: &str) -> Result<u32, String> {
    if s.is_empty() {
        return Err("Permissions string must not be empty".to_string());
    }
    for ch in s.chars() {
        if !('0'..='7').contains(&ch) {
            return Err(format!(
                "Invalid permissions '{}': must be an octal string (digits 0-7 only)",
                s
            ));
        }
    }
    u32::from_str_radix(s, 8).map_err(|e| format!("Invalid permissions '{}': {}", s, e))
}

fn resolve_path(config_dir: &Path, raw: &str) -> PathBuf {
    let p = Path::new(raw);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        config_dir.join(p)
    }
}

fn expand_tilde(raw: &str, owner_home: &Path) -> String {
    if raw == "~" {
        owner_home.to_string_lossy().to_string()
    } else if let Some(rest) = raw.strip_prefix("~/") {
        owner_home.join(rest).to_string_lossy().to_string()
    } else {
        raw.to_string()
    }
}

fn config_owner_home(config_path: &Path) -> Result<PathBuf, String> {
    let metadata =
        std::fs::metadata(config_path).map_err(|e| format!("Cannot stat config file: {}", e))?;
    let uid = nix::unistd::Uid::from_raw(metadata.uid());
    let user = nix::unistd::User::from_uid(uid)
        .map_err(|e| format!("Cannot look up config file owner: {}", e))?
        .ok_or_else(|| format!("Cannot find user with uid {} (owner of config file)", uid))?;
    Ok(user.dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_permissions_private() {
        let p = PermissionPreset::Private;
        assert_eq!(p.map_permissions(0o644), 0o600);
        assert_eq!(p.map_permissions(0o755), 0o700);
        assert_eq!(p.map_permissions(0o777), 0o700);
        assert_eq!(p.map_permissions(0o600), 0o600);
    }

    #[test]
    fn test_map_permissions_shared() {
        let p = PermissionPreset::Shared;
        assert_eq!(p.map_permissions(0o644), 0o664);
        assert_eq!(p.map_permissions(0o755), 0o775);
    }

    #[test]
    fn test_map_permissions_group() {
        let p = PermissionPreset::Group;
        assert_eq!(p.map_permissions(0o644), 0o660);
        assert_eq!(p.map_permissions(0o755), 0o770);
    }

    #[test]
    fn test_map_permissions_group_read() {
        let p = PermissionPreset::GroupRead;
        assert_eq!(p.map_permissions(0o644), 0o640);
        assert_eq!(p.map_permissions(0o755), 0o750);
    }

    #[test]
    fn test_map_permissions_public_is_identity() {
        let p = PermissionPreset::Public;
        assert_eq!(p.map_permissions(0o644), 0o644);
        assert_eq!(p.map_permissions(0o755), 0o755);
        assert_eq!(p.map_permissions(0o600), 0o600);
    }

    #[test]
    fn test_reverse_map_permissions() {
        let cases = [
            (PermissionPreset::Private, 0o600, 0o644),
            (PermissionPreset::Private, 0o700, 0o755),
            (PermissionPreset::Shared, 0o664, 0o644),
            (PermissionPreset::Shared, 0o775, 0o755),
            (PermissionPreset::Group, 0o660, 0o644),
            (PermissionPreset::Group, 0o770, 0o755),
            (PermissionPreset::GroupRead, 0o640, 0o644),
            (PermissionPreset::GroupRead, 0o750, 0o755),
        ];
        for (preset, target, expected) in cases {
            assert_eq!(
                preset.reverse_map_permissions(target),
                expected,
                "reverse_map({:o}) for {:?} should be {:o}",
                target,
                preset,
                expected
            );
        }
        assert_eq!(
            PermissionPreset::Public.reverse_map_permissions(0o644),
            0o644
        );
        assert_eq!(
            PermissionPreset::Public.reverse_map_permissions(0o755),
            0o755
        );
    }

    #[test]
    fn test_resolve_relative_paths() {
        let dir = Path::new("/home/user/configs");
        assert_eq!(
            resolve_path(dir, "./source"),
            PathBuf::from("/home/user/configs/source")
        );
        assert_eq!(
            resolve_path(dir, "relative/dir"),
            PathBuf::from("/home/user/configs/relative/dir")
        );
    }

    #[test]
    fn test_resolve_absolute_path() {
        let dir = Path::new("/home/user/configs");
        assert_eq!(resolve_path(dir, "/etc/nginx"), PathBuf::from("/etc/nginx"));
    }

    #[test]
    fn test_load_config_valid() {
        let dir = tempfile::TempDir::new().unwrap();
        let src_dir = dir.path().join("source");
        let tgt_dir = dir.path().join("target");
        std::fs::create_dir(&src_dir).unwrap();
        std::fs::create_dir(&tgt_dir).unwrap();

        let config_path = dir.path().join("config.toml");
        let config_content = format!(
            r#"[[sync]]
source = "{}"
target = "{}"
globs = ["*.conf"]
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        assert_eq!(resolved.sync_groups.len(), 1);
        assert_eq!(resolved.sync_groups[0].source_dir, src_dir);
        assert_eq!(resolved.sync_groups[0].target_dir, tgt_dir);
        assert_eq!(resolved.sync_groups[0].globs.len(), 1);
        assert_eq!(
            resolved.state_path,
            config_path.with_extension("cfgsync.state")
        );
    }

    #[test]
    fn test_load_config_with_file_perms_and_owner() {
        let dir = tempfile::TempDir::new().unwrap();
        let src_dir = dir.path().join("source");
        let tgt_dir = dir.path().join("target");
        std::fs::create_dir(&src_dir).unwrap();
        std::fs::create_dir(&tgt_dir).unwrap();

        let config_path = dir.path().join("config.toml");
        let config_content = format!(
            r#"[[sync]]
source = "{}"
target = "{}"
owner = "root:root"
file_perms = "private"
globs = [
    "**/*.service",
    {{ pattern = "ssh/sshd_config", file_perms = "public" }},
]
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        let group = &resolved.sync_groups[0];
        assert!(matches!(group.file_perms, Some(PermissionPreset::Private)));
        assert_eq!(group.owner.as_deref(), Some("root:root"));

        let g0 = &group.globs[0];
        assert_eq!(g0.pattern, "**/*.service");
        assert!(matches!(g0.file_perms, Some(PermissionPreset::Private)));
        assert_eq!(g0.owner.as_deref(), Some("root:root"));

        let g1 = &group.globs[1];
        assert_eq!(g1.pattern, "ssh/sshd_config");
        assert!(matches!(g1.file_perms, Some(PermissionPreset::Public)));
        assert_eq!(g1.owner.as_deref(), Some("root:root"));
    }

    #[test]
    fn test_load_config_missing_source_dir() {
        let dir = tempfile::TempDir::new().unwrap();
        let config_path = dir.path().join("config.toml");
        std::fs::write(
            &config_path,
            r#"[[sync]]
source = "/nonexistent/path"
target = "."
globs = ["*.conf"]"#,
        )
        .unwrap();

        let result = load_config(&config_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("source"));
    }

    #[test]
    fn test_load_config_no_sync_groups() {
        let dir = tempfile::TempDir::new().unwrap();
        let config_path = dir.path().join("config.toml");
        std::fs::write(&config_path, r#""#).unwrap();

        let result = load_config(&config_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("sync"));
    }

    #[test]
    fn test_load_config_empty_globs() {
        let dir = tempfile::TempDir::new().unwrap();
        let src_dir = dir.path().join("source");
        let tgt_dir = dir.path().join("target");
        std::fs::create_dir(&src_dir).unwrap();
        std::fs::create_dir(&tgt_dir).unwrap();

        let config_path = dir.path().join("config.toml");
        let config_content = format!(
            r#"[[sync]]
source = "{}"
target = "{}"
globs = []
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let result = load_config(&config_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("glob"));
    }

    #[test]
    fn test_load_config_invalid_glob() {
        let dir = tempfile::TempDir::new().unwrap();
        let src_dir = dir.path().join("source");
        let tgt_dir = dir.path().join("target");
        std::fs::create_dir(&src_dir).unwrap();
        std::fs::create_dir(&tgt_dir).unwrap();

        let config_path = dir.path().join("config.toml");
        let config_content = format!(
            r#"[[sync]]
source = "{}"
target = "{}"
globs = ["[invalid"]
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let result = load_config(&config_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("glob"));
    }

    #[test]
    fn test_old_config_format_error() {
        let dir = tempfile::TempDir::new().unwrap();
        let config_path = dir.path().join("config.toml");
        std::fs::write(
            &config_path,
            r#"source_dir = "./source"
target_dir = "./target"

[[filter]]
glob = "*.conf"
"#,
        )
        .unwrap();

        let result = load_config(&config_path);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("[[sync]]"),
            "expected hint about new format, got: {}",
            err
        );
    }

    #[test]
    fn test_load_config_simple_glob_string() {
        let dir = tempfile::TempDir::new().unwrap();
        let src_dir = dir.path().join("source");
        let tgt_dir = dir.path().join("target");
        std::fs::create_dir(&src_dir).unwrap();
        std::fs::create_dir(&tgt_dir).unwrap();

        let config_path = dir.path().join("config.toml");
        let config_content = format!(
            r#"[[sync]]
source = "{}"
target = "{}"
globs = ["*.conf", "*.txt"]
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        assert_eq!(resolved.sync_groups[0].globs.len(), 2);
    }

    #[test]
    fn test_load_config_detailed_glob_with_overrides() {
        let dir = tempfile::TempDir::new().unwrap();
        let src_dir = dir.path().join("source");
        let tgt_dir = dir.path().join("target");
        std::fs::create_dir(&src_dir).unwrap();
        std::fs::create_dir(&tgt_dir).unwrap();

        let config_path = dir.path().join("config.toml");
        let config_content = format!(
            r#"[[sync]]
source = "{}"
target = "{}"
owner = "root:root"
file_perms = "private"
globs = [
    {{ pattern = "secret.key", file_perms = "public", owner = "nobody:nogroup" }},
]
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        let g = &resolved.sync_groups[0].globs[0];
        assert_eq!(g.pattern, "secret.key");
        assert!(matches!(g.file_perms, Some(PermissionPreset::Public)));
        assert_eq!(g.owner.as_deref(), Some("nobody:nogroup"));
    }

    #[test]
    fn test_parse_permissions_valid() {
        assert_eq!(parse_permissions("644").unwrap(), 0o644);
        assert_eq!(parse_permissions("755").unwrap(), 0o755);
        assert_eq!(parse_permissions("0755").unwrap(), 0o755);
        assert_eq!(parse_permissions("0").unwrap(), 0);
        assert_eq!(parse_permissions("600").unwrap(), 0o600);
        assert_eq!(parse_permissions("777").unwrap(), 0o777);
    }

    #[test]
    fn test_parse_permissions_invalid() {
        assert!(parse_permissions("").is_err());
        assert!(parse_permissions("abc").is_err());
        assert!(parse_permissions("688").is_err());
        assert!(parse_permissions("999").is_err());
        assert!(parse_permissions("8").is_err());
    }

    #[test]
    fn test_load_config_two_groups_one_with_owner_one_without() {
        let dir = tempfile::TempDir::new().unwrap();
        let src_a = dir.path().join("src-a");
        let tgt_a = dir.path().join("tgt-a");
        let src_b = dir.path().join("src-b");
        let tgt_b = dir.path().join("tgt-b");
        std::fs::create_dir(&src_a).unwrap();
        std::fs::create_dir(&tgt_a).unwrap();
        std::fs::create_dir(&src_b).unwrap();
        std::fs::create_dir(&tgt_b).unwrap();

        let config_path = dir.path().join("config.toml");
        let config_content = format!(
            r#"[[sync]]
source = "{}"
target = "{}"
owner = "root:root"
file_perms = "public"
globs = ["*.conf"]

[[sync]]
source = "{}"
target = "{}"
globs = ["*.txt"]
"#,
            src_a.display(),
            tgt_a.display(),
            src_b.display(),
            tgt_b.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        assert_eq!(resolved.sync_groups.len(), 2);

        let g0 = &resolved.sync_groups[0];
        assert_eq!(g0.owner.as_deref(), Some("root:root"));
        assert!(matches!(g0.file_perms, Some(PermissionPreset::Public)));
        assert_eq!(g0.globs[0].owner.as_deref(), Some("root:root"));
        assert!(matches!(
            g0.globs[0].file_perms,
            Some(PermissionPreset::Public)
        ));

        let g1 = &resolved.sync_groups[1];
        assert_eq!(g1.owner, None);
        assert_eq!(g1.file_perms, None);
        assert_eq!(g1.globs[0].owner, None);
        assert_eq!(g1.globs[0].file_perms, None);
    }

    #[test]
    fn test_load_config_two_groups_mixed_globs() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        let config_path = dir.path().join("config.toml");
        let config_content = format!(
            r#"[[sync]]
source = "{}"
target = "{}"
globs = ["*.conf", {{ pattern = "secret.key", file_perms = "private" }}]

[[sync]]
source = "{}"
target = "{}"
file_perms = "shared"
globs = ["*.txt"]
"#,
            src.display(),
            tgt.display(),
            src.display(),
            tgt.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        assert_eq!(resolved.sync_groups.len(), 2);

        let g0 = &resolved.sync_groups[0];
        assert_eq!(g0.globs.len(), 2);
        assert_eq!(g0.globs[0].file_perms, None);
        assert!(matches!(
            g0.globs[1].file_perms,
            Some(PermissionPreset::Private)
        ));
        assert_eq!(g0.globs[1].pattern, "secret.key");

        let g1 = &resolved.sync_groups[1];
        assert_eq!(g1.globs.len(), 1);
        assert!(matches!(g1.file_perms, Some(PermissionPreset::Shared)));
        assert!(matches!(
            g1.globs[0].file_perms,
            Some(PermissionPreset::Shared)
        ));
    }

    #[test]
    fn test_load_config_detailed_glob_permissions_no_group_default() {
        let dir = tempfile::TempDir::new().unwrap();
        let src = dir.path().join("source");
        let tgt = dir.path().join("target");
        std::fs::create_dir(&src).unwrap();
        std::fs::create_dir(&tgt).unwrap();

        let config_path = dir.path().join("config.toml");
        let config_content = format!(
            r#"[[sync]]
source = "{}"
target = "{}"
globs = [
    "*.conf",
    {{ pattern = "secret.key", file_perms = "public" }},
]
"#,
            src.display(),
            tgt.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        let g = &resolved.sync_groups[0];
        assert_eq!(g.file_perms, None);
        assert_eq!(g.globs[0].file_perms, None);
        assert!(matches!(
            g.globs[1].file_perms,
            Some(PermissionPreset::Public)
        ));
        assert_eq!(g.globs[1].owner, None);
    }

    #[test]
    fn test_load_config_with_hooks() {
        let dir = tempfile::TempDir::new().unwrap();
        let src_dir = dir.path().join("source");
        let tgt_dir = dir.path().join("target");
        std::fs::create_dir(&src_dir).unwrap();
        std::fs::create_dir(&tgt_dir).unwrap();

        let config_path = dir.path().join("config.toml");
        let config_content = format!(
            r#"[[sync]]
source = "{}"
target = "{}"
globs = ["*.conf"]

[[sync]]
source = "{}"
target = "{}"
hooks = {{ after = "echo hello" }}
globs = ["*.txt"]
"#,
            src_dir.display(),
            tgt_dir.display(),
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        assert_eq!(resolved.sync_groups.len(), 2);
        assert_eq!(resolved.sync_groups[0].hook_after, None);
        assert_eq!(
            resolved.sync_groups[1].hook_after,
            Some("echo hello".to_string())
        );
    }

    #[test]
    fn test_load_config_without_hooks() {
        let dir = tempfile::TempDir::new().unwrap();
        let src_dir = dir.path().join("source");
        let tgt_dir = dir.path().join("target");
        std::fs::create_dir(&src_dir).unwrap();
        std::fs::create_dir(&tgt_dir).unwrap();

        let config_path = dir.path().join("config.toml");
        let config_content = format!(
            r#"[[sync]]
source = "{}"
target = "{}"
globs = ["*.conf"]
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        assert_eq!(resolved.sync_groups[0].hook_after, None);
    }

    #[test]
    fn test_load_config_with_empty_hooks() {
        let dir = tempfile::TempDir::new().unwrap();
        let src_dir = dir.path().join("source");
        let tgt_dir = dir.path().join("target");
        std::fs::create_dir(&src_dir).unwrap();
        std::fs::create_dir(&tgt_dir).unwrap();

        let config_path = dir.path().join("config.toml");
        let config_content = format!(
            r#"[[sync]]
source = "{}"
target = "{}"
hooks = {{}}
globs = ["*.conf"]
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        assert_eq!(resolved.sync_groups[0].hook_after, None);
    }
}
