pub fn print_schema() {
    let text = include_str!("schema_doc.toml").trim_end();
    println!("{}", text);
}
