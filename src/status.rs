use crate::changes::ChangeCounts;

pub fn print_status(counts: &ChangeCounts) {
    println!("source -> target: {}", counts.copy_to_target);
    println!("target -> source: {}", counts.copy_to_source);
    println!("deleted target:   {}", counts.delete_target);
    println!("deleted source:   {}", counts.delete_source);
    if counts.conflicts > 0 {
        println!("conflicts:        {}", counts.conflicts);
    }
}
