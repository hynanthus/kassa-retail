//! Kassa - 1С:Розница для Казахстана
//!
//! Это приложение предназначено для розничных продаж в магазинах.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
