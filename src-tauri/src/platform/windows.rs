use std::collections::HashMap;
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;

use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, HWND, RECT};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY_CLASSES_ROOT, KEY_READ, REG_SZ,
};
use windows_sys::Win32::System::Threading::{
    CreateMutexW, OpenProcess, ReleaseMutex, TerminateProcess, WaitForSingleObject,
    PROCESS_QUERY_INFORMATION, PROCESS_TERMINATE, PROCESS_VM_READ,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsWindowVisible, MoveWindow, ShowWindow,
};

const WAIT_OBJECT_0: u32 = 0;
const WAIT_ABANDONED_0: u32 = 0x80;
const CREATE_NO_WINDOW: u32 = 0x08000000;
const INVALID_HANDLE_VALUE: HANDLE = -1isize as HANDLE;
const SW_MINIMIZE: i32 = 6;

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

pub fn get_roblox_pids() -> Vec<u32> {
    let mut pids = Vec::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot.is_null() || snapshot == INVALID_HANDLE_VALUE {
            return pids;
        }

        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let name_len = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..name_len]);
                if name.eq_ignore_ascii_case("RobloxPlayerBeta.exe") {
                    pids.push(entry.th32ProcessID);
                }
                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
    }
    pids
}

pub fn kill_process(pid: u32) -> Result<(), String> {
    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if handle.is_null() {
            return Err(format!("Failed to open process {}", pid));
        }
        let result = TerminateProcess(handle, 1);
        CloseHandle(handle);
        if result == 0 {
            return Err(format!("Failed to terminate process {}", pid));
        }
    }
    Ok(())
}

pub fn kill_all_roblox() -> u32 {
    let pids = get_roblox_pids();
    let mut killed = 0u32;
    for pid in pids {
        if kill_process(pid).is_ok() {
            killed += 1;
        }
    }
    killed
}

pub fn build_launch_url(
    ticket: &str,
    place_id: i64,
    job_id: &str,
    browser_tracker_id: &str,
    launch_data: &str,
    follow_user: bool,
    join_vip: bool,
    access_code: &str,
    link_code: &str,
    is_teleport: bool,
) -> String {
    let launch_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let ld_param = if launch_data.is_empty() {
        String::new()
    } else {
        format!("&launchData={}", urlencoding::encode(launch_data))
    };

    let place_launcher_url = if join_vip {
        format!(
            "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestPrivateGame&placeId={}&accessCode={}&linkCode={}{}",
            place_id, access_code, link_code, ld_param
        )
    } else if follow_user {
        format!(
            "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestFollowUser&userId={}{}",
            place_id, ld_param
        )
    } else {
        let req = if job_id.is_empty() {
            "RequestGame"
        } else {
            "RequestGameJob"
        };
        let gid = if job_id.is_empty() {
            String::new()
        } else {
            format!("&gameId={}", job_id)
        };
        let tp = if is_teleport { "&isTeleport=true" } else { "" };
        format!(
            "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request={}&browserTrackerId={}&placeId={}{}&isPlayTogetherGame=false{}{}",
            req, browser_tracker_id, place_id, gid, tp, ld_param
        )
    };

    format!(
        "roblox-player:1+launchmode:play+gameinfo:{}+launchtime:{}+placelauncherurl:{}+browsertrackerid:{}+robloxLocale:en_us+gameLocale:en_us+channel:+LaunchExp:InApp",
        ticket,
        launch_time,
        urlencoding::encode(&place_launcher_url),
        browser_tracker_id
    )
}

pub fn launch_url(url: &str) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", url])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to launch: {}", e))?;
    Ok(())
}

pub fn launch_old_join(
    ticket: &str,
    place_id: i64,
    job_id: &str,
    launch_data: &str,
    follow_user: bool,
    join_vip: bool,
    access_code: &str,
    link_code: &str,
    is_teleport: bool,
) -> Result<(), String> {
    let version_folder = get_roblox_path()?;
    let exe = std::path::Path::new(&version_folder).join("RobloxPlayerBeta.exe");
    if !exe.exists() {
        return Err("RobloxPlayerBeta.exe not found in Roblox version folder".into());
    }

    let ld_param = if launch_data.is_empty() {
        String::new()
    } else {
        format!("&launchData={}", urlencoding::encode(launch_data))
    };

    let join_url = if join_vip {
        format!(
            "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestPrivateGame&placeId={}&accessCode={}&linkCode={}{}",
            place_id, access_code, link_code, ld_param
        )
    } else if follow_user {
        format!(
            "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestFollowUser&userId={}{}",
            place_id, ld_param
        )
    } else {
        let req = if job_id.is_empty() {
            "RequestGame"
        } else {
            "RequestGameJob"
        };
        let gid = if job_id.is_empty() {
            String::new()
        } else {
            format!("&gameId={}", job_id)
        };
        let tp = if is_teleport { "&isTeleport=true" } else { "" };
        format!(
            "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request={}&placeId={}{}&isPlayTogetherGame=false{}{}",
            req, place_id, gid, tp, ld_param
        )
    };

    std::process::Command::new(exe)
        .arg("--app")
        .arg("-t")
        .arg(ticket)
        .arg("-j")
        .arg(join_url)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to launch old join: {}", e))?;

    Ok(())
}

pub fn apply_fps_unlock(max_fps: u32) -> Result<(), String> {
    let settings_file = get_client_settings_file()?;

    let mut settings: serde_json::Value = if settings_file.exists() {
        std::fs::read_to_string(&settings_file)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    settings["DFIntTaskSchedulerTargetFps"] = serde_json::json!(max_fps);

    std::fs::write(
        &settings_file,
        serde_json::to_string(&settings).unwrap_or_default(),
    )
    .map_err(|e| format!("Failed to write ClientAppSettings.json: {}", e))
}

fn get_global_basic_settings_file() -> Option<PathBuf> {
    let local_app_data = std::env::var("LOCALAPPDATA").ok()?;
    Some(
        std::path::Path::new(&local_app_data)
            .join("Roblox")
            .join("GlobalBasicSettings_13.xml"),
    )
}

fn find_user_game_settings_properties_range(xml: &str) -> Option<(usize, usize)> {
    let class_pos = xml.find("class=\"UserGameSettings\"")?;
    let item_start = xml[..class_pos].rfind("<Item")?;
    let properties_open_rel = xml[item_start..].find("<Properties>")?;
    let properties_open = item_start + properties_open_rel;
    let content_start = properties_open + "<Properties>".len();
    let properties_close_rel = xml[content_start..].find("</Properties>")?;
    let content_end = content_start + properties_close_rel;
    Some((content_start, content_end))
}

fn upsert_scalar_property(props: &mut String, tag: &str, name: &str, value: &str) {
    let open = format!("<{} name=\"{}\">", tag, name);
    let close = format!("</{}>", tag);

    if let Some(start) = props.find(&open) {
        let value_start = start + open.len();
        if let Some(end_rel) = props[value_start..].find(&close) {
            let value_end = value_start + end_rel;
            props.replace_range(value_start..value_end, value);
            return;
        }
    }

    if !props.ends_with('\n') {
        props.push('\n');
    }
    props.push_str(&format!(
        "\t\t\t<{} name=\"{}\">{}</{}>\n",
        tag, name, value, tag
    ));
}

fn upsert_vector2_property(props: &mut String, name: &str, x: u32, y: u32) {
    let open = format!("<Vector2 name=\"{}\">", name);
    let close = "</Vector2>";
    let block = format!(
        "<Vector2 name=\"{}\">\n\t\t\t\t<X>{}</X>\n\t\t\t\t<Y>{}</Y>\n\t\t\t</Vector2>",
        name, x, y
    );

    if let Some(start) = props.find(&open) {
        if let Some(end_rel) = props[start..].find(close) {
            let end = start + end_rel + close.len();
            props.replace_range(start..end, &block);
            return;
        }
    }

    if !props.ends_with('\n') {
        props.push('\n');
    }
    props.push_str("\t\t\t");
    props.push_str(&block);
    props.push('\n');
}

fn apply_global_basic_settings_overrides(
    max_fps: Option<u32>,
    master_volume: Option<f32>,
    graphics_level: Option<u32>,
    window_size: Option<(u32, u32)>,
) -> Result<(), String> {
    let Some(path) = get_global_basic_settings_file() else {
        return Ok(());
    };
    if !path.exists() {
        return Ok(());
    }

    let mut xml = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read GlobalBasicSettings_13.xml: {}", e))?;

    let Some((start, end)) = find_user_game_settings_properties_range(&xml) else {
        return Ok(());
    };

    let mut props = xml[start..end].to_string();

    if let Some(fps) = max_fps {
        upsert_scalar_property(&mut props, "int", "FramerateCap", &fps.to_string());
    }

    if let Some(volume) = master_volume {
        let clamped = volume.clamp(0.0, 1.0);
        upsert_scalar_property(
            &mut props,
            "float",
            "MasterVolume",
            &format!("{:.6}", clamped),
        );
    }

    if let Some(level) = graphics_level {
        let clamped = level.clamp(1, 10);
        upsert_scalar_property(
            &mut props,
            "int",
            "GraphicsQualityLevel",
            &clamped.to_string(),
        );
        upsert_scalar_property(
            &mut props,
            "token",
            "SavedQualityLevel",
            &clamped.to_string(),
        );
        upsert_scalar_property(&mut props, "int", "QualityResetLevel", &clamped.to_string());
        upsert_scalar_property(&mut props, "bool", "MaxQualityEnabled", "false");
    }

    if let Some((w, h)) = window_size {
        let width = w.max(320);
        let height = h.max(240);
        upsert_scalar_property(&mut props, "bool", "StartMaximized", "false");
        upsert_scalar_property(&mut props, "bool", "Fullscreen", "false");
        upsert_vector2_property(&mut props, "StartScreenSize", width, height);
    }

    xml.replace_range(start..end, &props);
    std::fs::write(&path, xml)
        .map_err(|e| format!("Failed to write GlobalBasicSettings_13.xml: {}", e))
}

pub fn apply_runtime_client_settings(
    max_fps: Option<u32>,
    master_volume: Option<f32>,
    graphics_level: Option<u32>,
    window_size: Option<(u32, u32)>,
) -> Result<(), String> {
    if let Some(fps) = max_fps {
        apply_fps_unlock(fps)?;
    }

    if max_fps.is_some()
        || master_volume.is_some()
        || graphics_level.is_some()
        || window_size.is_some()
    {
        apply_global_basic_settings_overrides(max_fps, master_volume, graphics_level, window_size)?;
    }

    Ok(())
}

pub fn copy_custom_client_settings(custom_settings_path: &str) -> Result<(), String> {
    let custom_path = std::path::Path::new(custom_settings_path);
    if !custom_path.exists() {
        return Err("Custom ClientAppSettings.json path does not exist".into());
    }

    let content = std::fs::read_to_string(custom_path)
        .map_err(|e| format!("Failed to read custom settings file: {}", e))?;
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| format!("Custom settings file is not valid JSON: {}", e))?;

    let settings_file = get_client_settings_file()?;
    std::fs::write(settings_file, content)
        .map_err(|e| format!("Failed to copy custom ClientAppSettings.json: {}", e))
}

struct EnumWindowData {
    target_pid: u32,
    result_hwnd: HWND,
}

unsafe extern "system" fn enum_window_callback(hwnd: HWND, lparam: isize) -> i32 {
    let data = &mut *(lparam as *mut EnumWindowData);
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == data.target_pid && IsWindowVisible(hwnd) != 0 {
        data.result_hwnd = hwnd;
        return 0;
    }
    1
}

pub fn find_main_window(target_pid: u32) -> Option<HWND> {
    let mut data = EnumWindowData {
        target_pid,
        result_hwnd: std::ptr::null_mut(),
    };
    unsafe {
        EnumWindows(Some(enum_window_callback), &mut data as *mut _ as isize);
    }
    if !data.result_hwnd.is_null() {
        Some(data.result_hwnd)
    } else {
        None
    }
}

pub fn get_window_position(hwnd: HWND) -> Option<(i32, i32, i32, i32)> {
    unsafe {
        let mut rect: RECT = std::mem::zeroed();
        if GetWindowRect(hwnd, &mut rect) != 0 {
            Some((
                rect.left,
                rect.top,
                rect.right - rect.left,
                rect.bottom - rect.top,
            ))
        } else {
            None
        }
    }
}

pub fn set_window_position(hwnd: HWND, x: i32, y: i32, w: i32, h: i32) -> bool {
    unsafe { MoveWindow(hwnd, x, y, w, h, 1) != 0 }
}

pub fn minimize_window(hwnd: HWND) -> bool {
    unsafe { ShowWindow(hwnd, SW_MINIMIZE) != 0 }
}

fn wait_for_process_exit(pid: u32, timeout: Duration) -> bool {
    let started = std::time::Instant::now();
    while started.elapsed() < timeout {
        if !get_roblox_pids().contains(&pid) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    !get_roblox_pids().contains(&pid)
}

pub fn get_foreground_hwnd() -> HWND {
    unsafe { GetForegroundWindow() }
}

pub fn get_window_title(hwnd: HWND) -> String {
    unsafe {
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return String::new();
        }
        let mut buf = vec![0u16; (len + 1) as usize];
        let read = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if read > 0 {
            String::from_utf16_lossy(&buf[..read as usize])
        } else {
            String::new()
        }
    }
}

pub fn get_process_memory_mb(pid: u32) -> Option<u64> {
    #[repr(C)]
    struct ProcessMemoryCounters {
        cb: u32,
        page_fault_count: u32,
        peak_working_set_size: usize,
        working_set_size: usize,
        quota_peak_paged_pool_usage: usize,
        quota_paged_pool_usage: usize,
        quota_peak_non_paged_pool_usage: usize,
        quota_non_paged_pool_usage: usize,
        pagefile_usage: usize,
        peak_pagefile_usage: usize,
    }

    extern "system" {
        fn K32GetProcessMemoryInfo(
            process: HANDLE,
            ppsmemcounters: *mut ProcessMemoryCounters,
            cb: u32,
        ) -> i32;
    }

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);
        if handle.is_null() {
            return None;
        }
        let mut counters: ProcessMemoryCounters = std::mem::zeroed();
        counters.cb = std::mem::size_of::<ProcessMemoryCounters>() as u32;
        let result = K32GetProcessMemoryInfo(
            handle,
            &mut counters,
            std::mem::size_of::<ProcessMemoryCounters>() as u32,
        );
        CloseHandle(handle);
        if result != 0 {
            Some(counters.working_set_size as u64 / 1024 / 1024)
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TrackedProcess {
    pub pid: u32,
    pub user_id: i64,
    pub browser_tracker_id: String,
}

pub struct ProcessTracker {
    instances: Mutex<HashMap<i64, TrackedProcess>>,
    watcher_active: AtomicBool,
    launcher_cancelled: AtomicBool,
    next_account: AtomicBool,
}

impl ProcessTracker {
    pub fn new() -> Self {
        Self {
            instances: Mutex::new(HashMap::new()),
            watcher_active: AtomicBool::new(false),
            launcher_cancelled: AtomicBool::new(false),
            next_account: AtomicBool::new(false),
        }
    }

    pub fn track(&self, user_id: i64, pid: u32, browser_tracker_id: String) {
        if let Ok(mut instances) = self.instances.lock() {
            instances.insert(
                user_id,
                TrackedProcess {
                    pid,
                    user_id,
                    browser_tracker_id,
                },
            );
        }
    }

    pub fn untrack(&self, user_id: i64) {
        if let Ok(mut instances) = self.instances.lock() {
            instances.remove(&user_id);
        }
    }

    pub fn get_pid(&self, user_id: i64) -> Option<u32> {
        self.instances
            .lock()
            .ok()
            .and_then(|i| i.get(&user_id).map(|p| p.pid))
    }

    pub fn get_tracked_pids(&self) -> Vec<u32> {
        self.instances
            .lock()
            .ok()
            .map(|i| i.values().map(|p| p.pid).collect())
            .unwrap_or_default()
    }

    pub fn get_all(&self) -> Vec<TrackedProcess> {
        self.instances
            .lock()
            .ok()
            .map(|i| i.values().cloned().collect())
            .unwrap_or_default()
    }

    pub fn kill_for_user(&self, user_id: i64) -> bool {
        if let Some(pid) = self.get_pid(user_id) {
            let result = kill_process(pid).is_ok();
            self.untrack(user_id);
            result
        } else {
            false
        }
    }

    pub fn kill_for_user_graceful(&self, user_id: i64, timeout_ms: u64) -> bool {
        let Some(pid) = self.get_pid(user_id) else {
            return true;
        };

        let kill_ok = kill_process(pid).is_ok();
        let exited = if kill_ok {
            wait_for_process_exit(pid, Duration::from_millis(timeout_ms.max(250)))
        } else {
            false
        };
        self.untrack(user_id);
        exited
    }

    pub fn is_watcher_active(&self) -> bool {
        self.watcher_active.load(Ordering::Relaxed)
    }

    pub fn set_watcher_active(&self, active: bool) {
        self.watcher_active.store(active, Ordering::Relaxed);
    }

    pub fn cancel_launch(&self) {
        self.launcher_cancelled.store(true, Ordering::Relaxed);
    }

    pub fn is_launch_cancelled(&self) -> bool {
        self.launcher_cancelled.load(Ordering::Relaxed)
    }

    pub fn reset_launch_cancelled(&self) {
        self.launcher_cancelled.store(false, Ordering::Relaxed);
    }

    pub fn signal_next_account(&self) {
        self.next_account.store(true, Ordering::Relaxed);
    }

    pub fn is_next_account(&self) -> bool {
        self.next_account.load(Ordering::Relaxed)
    }

    pub fn reset_next_account(&self) {
        self.next_account.store(false, Ordering::Relaxed);
    }

    pub fn cleanup_dead_processes(&self) -> Vec<i64> {
        let alive_pids = get_roblox_pids();
        let mut dead_user_ids = Vec::new();

        if let Ok(mut instances) = self.instances.lock() {
            instances.retain(|user_id, process| {
                if alive_pids.contains(&process.pid) {
                    true
                } else {
                    dead_user_ids.push(*user_id);
                    false
                }
            });
        }

        dead_user_ids
    }
}
