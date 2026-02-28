struct SendHandle(HANDLE);
unsafe impl Send for SendHandle {}

static MULTI_ROBLOX_HANDLE: Mutex<Option<SendHandle>> = Mutex::new(None);
static TRACKER: LazyLock<ProcessTracker> = LazyLock::new(ProcessTracker::new);

fn encode_wide(s: &str) -> Vec<u16> {
    OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

pub fn tracker() -> &'static ProcessTracker {
    &TRACKER
}

pub fn generate_browser_tracker_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let a = (now % 75000 + 100000) as u64;
    let b = ((now / 31) % 800000 + 100000) as u64;
    format!("{}{}", a, b)
}

pub fn enable_multi_roblox() -> Result<bool, String> {
    let mut handle = MULTI_ROBLOX_HANDLE.lock().map_err(|e| e.to_string())?;
    if handle.is_some() {
        return Ok(true);
    }

    let name = encode_wide("ROBLOX_singletonMutex");
    unsafe {
        let h = CreateMutexW(std::ptr::null(), 1, name.as_ptr());
        if h.is_null() {
            return Err("Failed to create mutex".into());
        }
        let result = WaitForSingleObject(h, 0);
        if result != WAIT_OBJECT_0 && result != WAIT_ABANDONED_0 {
            CloseHandle(h);
            return Ok(false);
        }
        *handle = Some(SendHandle(h));
    }
    Ok(true)
}

pub fn disable_multi_roblox() -> Result<(), String> {
    let mut handle = MULTI_ROBLOX_HANDLE.lock().map_err(|e| e.to_string())?;
    if let Some(SendHandle(h)) = handle.take() {
        unsafe {
            ReleaseMutex(h);
            CloseHandle(h);
        }
    }
    Ok(())
}

pub fn get_roblox_path() -> Result<String, String> {
    unsafe {
        let key_name = encode_wide("roblox\\DefaultIcon");
        let mut hkey: windows_sys::Win32::System::Registry::HKEY = std::ptr::null_mut();

        if RegOpenKeyExW(HKEY_CLASSES_ROOT, key_name.as_ptr(), 0, KEY_READ, &mut hkey) == 0 {
            let mut buf = [0u16; 512];
            let mut buf_size = (buf.len() * 2) as u32;
            let mut value_type = 0u32;

            let result = RegQueryValueExW(
                hkey,
                std::ptr::null(),
                std::ptr::null_mut(),
                &mut value_type,
                buf.as_mut_ptr() as *mut u8,
                &mut buf_size,
            );

            RegCloseKey(hkey);

            if result == 0 && value_type == REG_SZ {
                let len = (buf_size as usize / 2).saturating_sub(1);
                let path = String::from_utf16_lossy(&buf[..len]);
                if let Some(parent) = std::path::Path::new(&path).parent() {
                    if parent.exists() {
                        return Ok(parent.to_string_lossy().into_owned());
                    }
                }
            }
        }
    }

    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let versions_dir = format!("{}\\Roblox\\Versions", local_app_data);

    if let Ok(entries) = std::fs::read_dir(&versions_dir) {
        let mut best: Option<(SystemTime, String)> = None;
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with("version-") && entry.path().join("RobloxPlayerBeta.exe").exists() {
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        if best.as_ref().map_or(true, |(t, _)| modified > *t) {
                            best = Some((modified, entry.path().to_string_lossy().into_owned()));
                        }
                    }
                }
            }
        }
        if let Some((_, path)) = best {
            return Ok(path);
        }
    }

    Err("Roblox installation not found".into())
}

fn get_client_settings_file() -> Result<PathBuf, String> {
    let version_folder = get_roblox_path()?;
    let settings_dir = std::path::Path::new(&version_folder).join("ClientSettings");

    if !settings_dir.exists() {
        std::fs::create_dir_all(&settings_dir)
            .map_err(|e| format!("Failed to create ClientSettings: {}", e))?;
    }

    Ok(settings_dir.join("ClientAppSettings.json"))
}
