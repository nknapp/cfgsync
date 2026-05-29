use crate::changes::Change;
use similar::TextDiff;
use std::io::Read;
use std::path::Path;

pub fn print_diffs(changes: &[Change]) {
    for change in changes {
        match change {
            Change::CopyToTarget {
                rel_path,
                abs_src,
                abs_tgt,
                ..
            } => {
                println!("\n=== {} (source -> target) ===", rel_path);
                print_unified_diff(abs_src, abs_tgt);
            }
            Change::CopyToSource {
                rel_path,
                abs_src,
                abs_tgt,
                ..
            } => {
                println!("\n=== {} (target -> source) ===", rel_path);
                print_unified_diff(abs_tgt, abs_src);
            }
            Change::Conflict {
                rel_path,
                abs_src,
                abs_tgt,
                ..
            } => {
                println!("\n=== {} (CONFLICT) ===", rel_path);
                print_unified_diff(abs_src, abs_tgt);
            }
            Change::DeleteTarget { rel_path, .. } => {
                println!("\n=== {} (would be deleted from target) ===", rel_path);
            }
            Change::DeleteSource { rel_path, .. } => {
                println!("\n=== {} (would be deleted from source) ===", rel_path);
            }
            Change::Cleanup { .. } => {}
        }
    }
}

fn print_unified_diff(old: &Path, new: &Path) {
    let read = |p: &Path| -> String {
        let mut f = match std::fs::File::open(p) {
            Ok(f) => f,
            Err(_) => return "(file missing)".to_string(),
        };
        let mut buf = String::new();
        f.read_to_string(&mut buf).unwrap_or_default();
        buf
    };

    let old_content = read(old);
    let new_content = read(new);

    let diff = TextDiff::from_lines(&old_content, &new_content);
    let udiff = diff.unified_diff();

    for change in udiff.iter_hunks() {
        print!("{}", change);
    }
}
