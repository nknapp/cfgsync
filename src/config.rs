use schemars::JsonSchema;
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct Config {
    #[schemars(
        description = "List of sync groups. Each group defines a source, target, and globs."
    )]
    pub sync: Vec<SyncGroup>,
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
    #[schemars(description = "Default permissions as an octal string (e.g. \"644\", \"755\")")]
    #[serde(default)]
    pub permissions: Option<String>,
    #[schemars(description = "Default owner (user:group) applied to synced files")]
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
        #[schemars(description = "Optional octal permission override for this glob")]
        #[serde(default)]
        permissions: Option<String>,
        #[schemars(description = "Optional owner override for this glob (user:group)")]
        #[serde(default)]
        owner: Option<String>,
    },
}

#[derive(Debug)]
pub struct ResolvedConfig {
    #[allow(dead_code)]
    pub config_dir: PathBuf,
    pub sync_groups: Vec<ResolvedSyncGroup>,
    pub state_path: PathBuf,
}

#[derive(Debug)]
pub struct ResolvedSyncGroup {
    pub source_dir: PathBuf,
    pub target_dir: PathBuf,
    pub globs: Vec<ResolvedGlob>,
    #[allow(dead_code)]
    pub permissions: Option<u32>,
    #[allow(dead_code)]
    pub owner: Option<String>,
}

#[derive(Debug)]
pub struct ResolvedGlob {
    #[allow(dead_code)]
    pub pattern: String,
    pub permissions: Option<u32>,
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

    let mut sync_groups = Vec::new();

    for group in &config.sync {
        if group.globs.is_empty() {
            return Err("Each [[sync]] group must have at least one glob".to_string());
        }

        let source_dir = resolve_path(&config_dir, &group.source);
        let target_dir = resolve_path(&config_dir, &group.target);

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

        let group_perms = group
            .permissions
            .as_deref()
            .map(parse_permissions)
            .transpose()?;

        let globs: Vec<ResolvedGlob> = group
            .globs
            .iter()
            .map(|entry| {
                let (pattern, perms, owner) = match entry {
                    GlobEntry::Simple(p) => (p.clone(), None, None),
                    GlobEntry::Detailed {
                        pattern,
                        permissions,
                        owner,
                    } => {
                        let entry_perms =
                            permissions.as_deref().map(parse_permissions).transpose()?;
                        (pattern.clone(), entry_perms, owner.clone())
                    }
                };

                glob::Pattern::new(&pattern)
                    .map_err(|e| format!("Invalid glob '{}': {}", pattern, e))?;

                Ok(ResolvedGlob {
                    pattern,
                    permissions: perms.or(group_perms),
                    owner: owner.or_else(|| group.owner.clone()),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;

        sync_groups.push(ResolvedSyncGroup {
            source_dir,
            target_dir,
            globs,
            permissions: group_perms,
            owner: group.owner.clone(),
        });
    }

    let state_path = config_path.with_extension("cfgsync.state");

    Ok(ResolvedConfig {
        config_dir,
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

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_load_config_with_permissions_and_owner() {
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
permissions = "644"
globs = [
    "**/*.service",
    {{ pattern = "ssh/sshd_config", permissions = "600" }},
]
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        let group = &resolved.sync_groups[0];
        assert_eq!(group.permissions, Some(0o644));
        assert_eq!(group.owner.as_deref(), Some("root:root"));

        let g0 = &group.globs[0];
        assert_eq!(g0.pattern, "**/*.service");
        assert_eq!(g0.permissions, Some(0o644));
        assert_eq!(g0.owner.as_deref(), Some("root:root"));

        let g1 = &group.globs[1];
        assert_eq!(g1.pattern, "ssh/sshd_config");
        assert_eq!(g1.permissions, Some(0o600));
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
permissions = "644"
globs = [
    {{ pattern = "secret.key", permissions = "600", owner = "nobody:nogroup" }},
]
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        let g = &resolved.sync_groups[0].globs[0];
        assert_eq!(g.pattern, "secret.key");
        assert_eq!(g.permissions, Some(0o600));
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
    fn test_load_config_permissions_invalid_string() {
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
permissions = "abc"
globs = ["*.conf"]
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let result = load_config(&config_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("permissions"));
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
permissions = "600"
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
        assert_eq!(g0.permissions, Some(0o600));
        assert_eq!(g0.globs[0].owner.as_deref(), Some("root:root"));
        assert_eq!(g0.globs[0].permissions, Some(0o600));

        let g1 = &resolved.sync_groups[1];
        assert_eq!(g1.owner, None);
        assert_eq!(g1.permissions, None);
        assert_eq!(g1.globs[0].owner, None);
        assert_eq!(g1.globs[0].permissions, None);
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
globs = ["*.conf", {{ pattern = "secret.key", permissions = "400" }}]

[[sync]]
source = "{}"
target = "{}"
permissions = "755"
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
        assert_eq!(g0.globs[0].permissions, None); // simple string, no overrides
        assert_eq!(g0.globs[1].permissions, Some(0o400)); // detailed with override
        assert_eq!(g0.globs[1].pattern, "secret.key");

        let g1 = &resolved.sync_groups[1];
        assert_eq!(g1.globs.len(), 1);
        assert_eq!(g1.permissions, Some(0o755));
        assert_eq!(g1.globs[0].permissions, Some(0o755)); // inherits group default
    }

    #[test]
    fn test_load_config_invalid_permissions_in_second_group() {
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
globs = ["*.conf"]

[[sync]]
source = "{}"
target = "{}"
permissions = "bad"
globs = ["*.txt"]
"#,
            src_a.display(),
            tgt_a.display(),
            src_b.display(),
            tgt_b.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let result = load_config(&config_path);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("permissions"), "got: {}", err);
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
    {{ pattern = "secret.key", permissions = "600" }},
]
"#,
            src.display(),
            tgt.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        let g = &resolved.sync_groups[0];
        // Group has no default permissions
        assert_eq!(g.permissions, None);
        // Simple glob inherits nothing
        assert_eq!(g.globs[0].permissions, None);
        // Detailed glob has its own permissions only
        assert_eq!(g.globs[1].permissions, Some(0o600));
        assert_eq!(g.globs[1].owner, None);
    }

    #[test]
    fn test_load_config_permissions_with_leading_zero() {
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
permissions = "0755"
globs = ["*.conf"]
"#,
            src.display(),
            tgt.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        assert_eq!(resolved.sync_groups[0].permissions, Some(0o755));
    }
}
