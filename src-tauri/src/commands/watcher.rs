#[cfg(target_os = "windows")]
#[tauri::command]
async fn start_watcher(
    app: tauri::AppHandle,
    settings: tauri::State<'_, SettingsStore>,
) -> Result<(), String> {
    use platform::windows;

    let tracker = windows::tracker();
    if tracker.is_watcher_active() {
        return Ok(());
    }
    tracker.set_watcher_active(true);

    let interval = settings.get_int("Watcher", "ScanInterval").unwrap_or(6) as u64;
    let read_interval_ms = settings
        .get_int("Watcher", "ReadInterval")
        .unwrap_or(250)
        .max(50) as u64;
    let mem_enabled = settings.get_bool("Watcher", "CloseRbxMemory");
    let mem_limit = settings.get_int("Watcher", "MemoryLowValue").unwrap_or(200) as u64;
    let title_enabled = settings.get_bool("Watcher", "CloseRbxWindowTitle");
    let expected_title = settings.get_string("Watcher", "ExpectedWindowTitle");
    let save_positions = settings.get_bool("Watcher", "SaveWindowPositions");
    let exit_if_no_connection = settings.get_bool("Watcher", "ExitIfNoConnection");
    let no_connection_timeout = settings
        .get_int("Watcher", "NoConnectionTimeout")
        .unwrap_or(60)
        .max(1) as u64;
    let exit_on_beta = settings.get_bool("Watcher", "ExitOnBeta");

    let app_handle = app.clone();

    tokio::spawn(async move {
        let mut disconnected_since: HashMap<i64, std::time::Instant> = HashMap::new();
        while tracker.is_watcher_active() {
            let sleep_ms = (interval * 1000).max(read_interval_ms);
            tokio::time::sleep(std::time::Duration::from_millis(sleep_ms)).await;

            if !tracker.is_watcher_active() {
                break;
            }

            let dead_users = tracker.cleanup_dead_processes();
            for uid in &dead_users {
                let _ = app_handle.emit(
                    "roblox-process-died",
                    serde_json::json!({
                        "userId": uid,
                    }),
                );
            }

            let instances = tracker.get_all();
            let fg_hwnd = windows::get_foreground_hwnd();

            for inst in &instances {
                if let Some(hwnd) = windows::find_main_window(inst.pid) {
                    if hwnd == fg_hwnd {
                        continue;
                    }

                    if mem_enabled {
                        if let Some(mem) = windows::get_process_memory_mb(inst.pid) {
                            if mem < mem_limit {
                                tracker.kill_for_user(inst.user_id);
                                let _ = app_handle.emit(
                                    "roblox-low-memory",
                                    serde_json::json!({
                                        "userId": inst.user_id,
                                        "memoryMb": mem,
                                    }),
                                );
                            }
                        }
                    }

                    if title_enabled && !expected_title.is_empty() {
                        let title = windows::get_window_title(hwnd);
                        if !title.is_empty() && title != expected_title {
                            tracker.kill_for_user(inst.user_id);
                            let _ = app_handle.emit(
                                "roblox-title-mismatch",
                                serde_json::json!({
                                    "userId": inst.user_id,
                                    "title": title,
                                    "expected": expected_title,
                                }),
                            );
                        }
                    }

                    if exit_on_beta {
                        let title = windows::get_window_title(hwnd);
                        if title.to_lowercase().contains("beta") {
                            tracker.kill_for_user(inst.user_id);
                            let _ = app_handle.emit(
                                "roblox-beta-detected",
                                serde_json::json!({
                                    "userId": inst.user_id,
                                    "title": title,
                                }),
                            );
                        }
                    }

                    if exit_if_no_connection {
                        let title = windows::get_window_title(hwnd).to_lowercase();
                        let looks_disconnected = title.contains("disconnected")
                            || title.contains("connection error")
                            || title.contains("lost connection")
                            || title.contains("no connection");
                        if looks_disconnected {
                            let since = disconnected_since
                                .entry(inst.user_id)
                                .or_insert_with(std::time::Instant::now);
                            if since.elapsed().as_secs() >= no_connection_timeout {
                                tracker.kill_for_user(inst.user_id);
                                let _ = app_handle.emit(
                                    "roblox-no-connection",
                                    serde_json::json!({
                                        "userId": inst.user_id,
                                        "title": title,
                                        "timeout": no_connection_timeout,
                                    }),
                                );
                                disconnected_since.remove(&inst.user_id);
                            }
                        } else {
                            disconnected_since.remove(&inst.user_id);
                        }
                    }

                    if save_positions {
                        if let Some((x, y, w, h)) = windows::get_window_position(hwnd) {
                            let store = app_handle.state::<AccountStore>();
                            if let Ok(accounts) = store.get_all() {
                                if let Some(mut account) =
                                    accounts.into_iter().find(|a| a.user_id == inst.user_id)
                                {
                                    account
                                        .fields
                                        .insert("Window_Position_X".into(), x.to_string());
                                    account
                                        .fields
                                        .insert("Window_Position_Y".into(), y.to_string());
                                    account.fields.insert("Window_Width".into(), w.to_string());
                                    account.fields.insert("Window_Height".into(), h.to_string());
                                    let _ = store.update(account);
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
async fn start_watcher(
    app: tauri::AppHandle,
    settings: tauri::State<'_, SettingsStore>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use platform::macos;

        let tracker = macos::tracker();
        if tracker.is_watcher_active() {
            return Ok(());
        }
        tracker.set_watcher_active(true);

        let interval = settings.get_int("Watcher", "ScanInterval").unwrap_or(6) as u64;
        let read_interval_ms = settings
            .get_int("Watcher", "ReadInterval")
            .unwrap_or(250)
            .max(50) as u64;
        let exit_if_no_connection = settings.get_bool("Watcher", "ExitIfNoConnection");
        let no_connection_timeout = settings
            .get_int("Watcher", "NoConnectionTimeout")
            .unwrap_or(60)
            .max(1) as u64;
        let exit_on_beta = settings.get_bool("Watcher", "ExitOnBeta");

        let app_handle = app.clone();
        tokio::spawn(async move {
            let mut disconnected_since: HashMap<i64, std::time::Instant> = HashMap::new();
            let mut log_offsets: HashMap<std::path::PathBuf, u64> = HashMap::new();

            while tracker.is_watcher_active() {
                let sleep_ms = (interval * 1000).max(read_interval_ms);
                tokio::time::sleep(std::time::Duration::from_millis(sleep_ms)).await;

                if !tracker.is_watcher_active() {
                    break;
                }

                let dead_users = tracker.cleanup_dead_processes();
                for uid in &dead_users {
                    let _ = app_handle.emit(
                        "roblox-process-died",
                        serde_json::json!({
                            "userId": uid,
                        }),
                    );
                }

                let instances = tracker.get_all();
                for inst in &instances {
                    if !exit_if_no_connection && !exit_on_beta {
                        continue;
                    }

                    let Some(log_path) = macos::latest_log_file_for_pid(inst.pid) else {
                        continue;
                    };
                    let cursor = log_offsets.entry(log_path.clone()).or_insert(0);
                    let chunk = match macos::read_log_delta(&log_path, cursor) {
                        Ok(s) => s,
                        Err(_) => continue,
                    };

                    let lower = chunk.to_lowercase();
                    if exit_on_beta && lower.contains("beta") {
                        tracker.kill_for_user(inst.user_id);
                        let _ = app_handle.emit(
                            "roblox-beta-detected",
                            serde_json::json!({
                                "userId": inst.user_id,
                                "logPath": log_path.to_string_lossy(),
                            }),
                        );
                    }

                    if exit_if_no_connection {
                        let looks_disconnected = lower.contains("disconnected")
                            || lower.contains("connection error")
                            || lower.contains("lost connection")
                            || lower.contains("no connection")
                            || lower.contains("error code: 277");

                        if looks_disconnected {
                            let since = disconnected_since
                                .entry(inst.user_id)
                                .or_insert_with(std::time::Instant::now);
                            if since.elapsed().as_secs() >= no_connection_timeout {
                                tracker.kill_for_user(inst.user_id);
                                let _ = app_handle.emit(
                                    "roblox-no-connection",
                                    serde_json::json!({
                                        "userId": inst.user_id,
                                        "timeout": no_connection_timeout,
                                        "logPath": log_path.to_string_lossy(),
                                    }),
                                );
                                disconnected_since.remove(&inst.user_id);
                            }
                        } else {
                            disconnected_since.remove(&inst.user_id);
                        }
                    }
                }
            }
        });

        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let _ = (app, settings);
        Err("Watcher is only supported on Windows and macOS".into())
    }
}

#[tauri::command]
fn stop_watcher() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        platform::windows::tracker().set_watcher_active(false);
    }
    #[cfg(target_os = "macos")]
    {
        platform::macos::tracker().set_watcher_active(false);
    }
    Ok(())
}
