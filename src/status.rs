use crate::changes::ChangeCounts;

pub fn print_status(counts: &ChangeCounts, short: bool) {
    if short {
        print_status_short(counts);
    } else {
        print_status_long(counts);
    }
}

fn print_status_long(counts: &ChangeCounts) {
    println!("source -> target: {}", counts.copy_to_target);
    println!("target -> source: {}", counts.copy_to_source);
    println!("deleted target:   {}", counts.delete_target);
    println!("deleted source:   {}", counts.delete_source);
    if counts.conflicts > 0 {
        println!("conflicts:        {}", counts.conflicts);
    }
}

fn print_status_short(counts: &ChangeCounts) {
    let to_target = counts.copy_to_target + counts.delete_target;
    let to_source = counts.copy_to_source + counts.delete_source;
    let mut parts = Vec::new();
    if to_target > 0 {
        parts.push(format!("{}→", to_target));
    }
    if to_source > 0 {
        parts.push(format!("{}←", to_source));
    }
    if counts.conflicts > 0 {
        parts.push(format!("{}↯", counts.conflicts));
    }
    if parts.is_empty() {
        println!("✓");
    } else {
        println!("{}", parts.join(" "));
    }
}
