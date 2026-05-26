use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
pub struct Config {
    pub source_dir: String,
    pub target_dir: String,
    #[serde(default)]
    pub filter: Vec<Filter>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Filter {
    pub glob: String,
    pub permissions: Option<u32>,
    pub owner: Option<String>,
}

#[derive(Debug)]
pub struct ResolvedConfig {
    #[allow(dead_code)]
    pub config_dir: PathBuf,
    pub source_dir: PathBuf,
    pub target_dir: PathBuf,
    pub filters: Vec<ResolvedFilter>,
    pub state_path: PathBuf,
}

#[derive(Debug)]
pub struct ResolvedFilter {
    #[allow(dead_code)]
    pub glob: String,
    pub permissions: Option<u32>,
    pub owner: Option<String>,
}

pub fn load_config(config_path: &Path) -> Result<ResolvedConfig, String> {
    let content = std::fs::read_to_string(config_path)
        .map_err(|e| format!("Cannot read config file '{}': {}", config_path.display(), e))?;

    let config: Config = toml::from_str(&content).map_err(|e| format!("Invalid config: {}", e))?;

    if config.filter.is_empty() {
        return Err("No filters defined in config".to_string());
    }

    let config_dir = config_path
        .parent()
        .ok_or_else(|| "Config file has no parent directory".to_string())?
        .to_path_buf();

    let source_dir = resolve_path(&config_dir, &config.source_dir);
    let target_dir = resolve_path(&config_dir, &config.target_dir);

    if !source_dir.is_dir() {
        return Err(format!(
            "source_dir '{}' does not exist or is not a directory",
            source_dir.display()
        ));
    }
    if !target_dir.is_dir() {
        return Err(format!(
            "target_dir '{}' does not exist or is not a directory",
            target_dir.display()
        ));
    }

    let source_dir = source_dir.canonicalize().map_err(|e| {
        format!(
            "Cannot resolve source_dir '{}': {}",
            source_dir.display(),
            e
        )
    })?;
    let target_dir = target_dir.canonicalize().map_err(|e| {
        format!(
            "Cannot resolve target_dir '{}': {}",
            target_dir.display(),
            e
        )
    })?;

    let state_path = config_path.with_extension("cfgsync.state");

    let filters: Vec<ResolvedFilter> = config
        .filter
        .into_iter()
        .map(|f| {
            let glob_str = f.glob;
            glob::Pattern::new(&glob_str)
                .map_err(|e| format!("Invalid glob '{}': {}", glob_str, e))?;
            Ok(ResolvedFilter {
                glob: glob_str,
                permissions: f.permissions,
                owner: f.owner,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    Ok(ResolvedConfig {
        config_dir,
        source_dir,
        target_dir,
        filters,
        state_path,
    })
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
            r#"source_dir = "{}"
target_dir = "{}"

[[filter]]
glob = "*.conf"
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        assert_eq!(resolved.source_dir, src_dir);
        assert_eq!(resolved.target_dir, tgt_dir);
        assert_eq!(resolved.filters.len(), 1);
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
            r#"source_dir = "{}"
target_dir = "{}"

[[filter]]
glob = "**/*.service"
permissions = 0o644
owner = "root:root"
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let resolved = load_config(&config_path).unwrap();
        let filter = &resolved.filters[0];
        assert_eq!(filter.permissions, Some(0o644));
        assert_eq!(filter.owner.as_deref(), Some("root:root"));
    }

    #[test]
    fn test_load_config_missing_source_dir() {
        let dir = tempfile::TempDir::new().unwrap();
        let config_path = dir.path().join("config.toml");
        std::fs::write(
            &config_path,
            r#"source_dir = "/nonexistent/path"
target_dir = "."
[[filter]]
glob = "*.conf""#,
        )
        .unwrap();

        let result = load_config(&config_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("source_dir"));
    }

    #[test]
    fn test_load_config_no_filters() {
        let dir = tempfile::TempDir::new().unwrap();
        let config_path = dir.path().join("config.toml");
        std::fs::write(
            &config_path,
            r#"source_dir = "."
target_dir = ".""#,
        )
        .unwrap();

        let result = load_config(&config_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("filter"));
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
            r#"source_dir = "{}"
target_dir = "{}"

[[filter]]
glob = "[invalid"
"#,
            src_dir.display(),
            tgt_dir.display()
        );
        std::fs::write(&config_path, config_content).unwrap();

        let result = load_config(&config_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("glob"));
    }
}
