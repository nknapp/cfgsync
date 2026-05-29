pub fn print_schema(json: bool) {
    if json {
        let schema = schemars::schema_for!(crate::config::Config);
        let json_str =
            serde_json::to_string_pretty(&schema).expect("Failed to serialize JSON Schema");
        println!("{}", json_str);
    } else {
        let text = include_str!("schema_doc.toml").trim_end();
        println!("{}", text);
    }
}
