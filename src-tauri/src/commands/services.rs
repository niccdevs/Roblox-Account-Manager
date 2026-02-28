#[tauri::command]
async fn start_web_server(app: tauri::AppHandle) -> Result<u16, String> {
    let accounts: &'static AccountStore =
        unsafe { &*(app.state::<AccountStore>().inner() as *const AccountStore) };
    let settings: &'static SettingsStore =
        unsafe { &*(app.state::<SettingsStore>().inner() as *const SettingsStore) };
    api::server::start(accounts, settings).await
}

#[tauri::command]
fn stop_web_server() -> Result<(), String> {
    api::server::stop()
}

#[tauri::command]
fn get_web_server_status() -> Result<api::server::WebServerStatus, String> {
    Ok(api::server::WebServerStatus {
        running: api::server::is_running(),
        port: api::server::get_port(),
    })
}

#[tauri::command]
async fn start_nexus_server(
    app: tauri::AppHandle,
    settings: tauri::State<'_, SettingsStore>,
) -> Result<u16, String> {
    let port = settings
        .get_int("AccountControl", "NexusPort")
        .unwrap_or(5242) as u16;
    let allow_external = settings.get_bool("AccountControl", "AllowExternalConnections");
    nexus::websocket::nexus()
        .start(port, allow_external, app)
        .await
}

#[tauri::command]
fn stop_nexus_server() -> Result<(), String> {
    nexus::websocket::nexus().stop();
    Ok(())
}

#[tauri::command]
fn get_nexus_status() -> Result<nexus::websocket::NexusStatus, String> {
    Ok(nexus::websocket::nexus().get_status())
}

#[tauri::command]
fn get_nexus_accounts() -> Result<Vec<nexus::websocket::AccountView>, String> {
    Ok(nexus::websocket::nexus().get_accounts())
}

#[tauri::command]
fn add_nexus_account(username: String) -> Result<(), String> {
    nexus::websocket::nexus().add_account(&username)
}

#[tauri::command]
fn remove_nexus_accounts(usernames: Vec<String>) -> Result<(), String> {
    nexus::websocket::nexus().remove_accounts(&usernames);
    Ok(())
}

#[tauri::command]
fn update_nexus_account(account: nexus::websocket::AccountView) -> Result<(), String> {
    nexus::websocket::nexus().update_account(account);
    Ok(())
}

#[tauri::command]
fn nexus_send_command(message: String) -> Result<(), String> {
    nexus::websocket::nexus().send_command(&message);
    Ok(())
}

#[tauri::command]
fn nexus_send_to_all(message: String) -> Result<(), String> {
    nexus::websocket::nexus().send_to_all(&message);
    Ok(())
}

#[tauri::command]
fn get_nexus_log() -> Result<Vec<String>, String> {
    Ok(nexus::websocket::nexus().get_log())
}

#[tauri::command]
fn clear_nexus_log() -> Result<(), String> {
    nexus::websocket::nexus().clear_log();
    Ok(())
}

#[tauri::command]
fn get_nexus_elements() -> Result<Vec<nexus::websocket::CustomElement>, String> {
    Ok(nexus::websocket::nexus().get_elements())
}

#[tauri::command]
fn set_nexus_element_value(name: String, value: String) -> Result<(), String> {
    nexus::websocket::nexus().set_element_value(&name, &value);
    Ok(())
}

#[tauri::command]
fn export_nexus_lua() -> Result<String, String> {
    let out_path = std::env::current_dir()
        .map_err(|e| format!("Failed to read current directory: {}", e))?
        .join("Nexus.lua");
    let content = include_str!("../../assets/Nexus.lua");
    std::fs::write(&out_path, content).map_err(|e| format!("Failed to write Nexus.lua: {}", e))?;
    Ok(out_path.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_repo_url() -> Result<(), String> {
    let url = "https://github.com/niccsprojects/Roblox-Account-Manager";

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Opening URL is not supported on this platform".into())
}
