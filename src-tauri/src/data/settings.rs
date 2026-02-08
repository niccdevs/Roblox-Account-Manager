use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IniProperty {
    pub name: String,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IniSection {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    properties: Vec<IniProperty>,
}

impl IniSection {
    fn new(name: String) -> Self {
        Self {
            name,
            comment: None,
            properties: Vec::new(),
        }
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        self.properties
            .iter()
            .find(|p| p.name == key)
            .map(|p| p.value.as_str())
    }

    pub fn get_bool(&self, key: &str) -> bool {
        self.get(key).map(|v| v == "true").unwrap_or(false)
    }

    pub fn get_int(&self, key: &str) -> i64 {
        self.get(key).and_then(|v| v.parse().ok()).unwrap_or(0)
    }

    pub fn get_float(&self, key: &str) -> f64 {
        self.get(key).and_then(|v| v.parse().ok()).unwrap_or(0.0)
    }

    pub fn exists(&self, key: &str) -> bool {
        self.properties.iter().any(|p| p.name == key)
    }

    pub fn set(&mut self, key: &str, value: &str, comment: Option<&str>) {
        if value.trim().is_empty() {
            self.remove(key);
            return;
        }

        if let Some(prop) = self.properties.iter_mut().find(|p| p.name == key) {
            prop.value = value.to_string();
            if let Some(c) = comment {
                prop.comment = Some(c.to_string());
            }
        } else {
            self.properties.push(IniProperty {
                name: key.to_string(),
                value: value.to_string(),
                comment: comment.map(|c| c.to_string()),
            });
        }
    }

    pub fn remove(&mut self, key: &str) {
        self.properties.retain(|p| p.name != key);
    }

    pub fn to_map(&self) -> HashMap<String, String> {
        self.properties
            .iter()
            .map(|p| (p.name.clone(), p.value.clone()))
            .collect()
    }
}

#[derive(Debug, Clone)]
pub struct IniFile {
    sections: Vec<IniSection>,
    write_spacing: bool,
    comment_char: char,
}

impl IniFile {
    pub fn new() -> Self {
        Self {
            sections: Vec::new(),
            write_spacing: false,
            comment_char: '#',
        }
    }

    pub fn load(path: &Path) -> Self {
        let mut ini = Self::new();
        if let Ok(data) = fs::read_to_string(path) {
            ini.parse(&data);
        }
        ini
    }

    fn parse(&mut self, content: &str) {
        let mut current_section: Option<usize> = None;

        for line in content.lines() {
            let trimmed = line.trim();

            if trimmed.is_empty() {
                continue;
            }

            if trimmed.starts_with(';') || trimmed.starts_with('#') {
                continue;
            }

            if trimmed.starts_with('[') && trimmed.ends_with(']') {
                let mut section_name = trimmed[1..trimmed.len() - 1].to_string();
                if section_name == "RBX Alt Manager" {
                    section_name = "Roblox Account Manager".to_string();
                }
                if !self.sections.iter().any(|s| s.name == section_name) {
                    self.sections.push(IniSection::new(section_name.clone()));
                }
                current_section = self.sections.iter().position(|s| s.name == section_name);
                continue;
            }

            if let Some(idx) = current_section {
                if let Some(eq_pos) = trimmed.find('=') {
                    let key = trimmed[..eq_pos].trim();
                    let value = trimmed[eq_pos + 1..].trim();
                    if !key.is_empty() && !value.is_empty() {
                        self.sections[idx].set(key, value, None);
                    }
                }
            }
        }
    }

    pub fn section(&mut self, name: &str) -> &mut IniSection {
        if !self.sections.iter().any(|s| s.name == name) {
            self.sections.push(IniSection::new(name.to_string()));
        }
        self.sections.iter_mut().find(|s| s.name == name).unwrap()
    }

    pub fn get_section(&self, name: &str) -> Option<&IniSection> {
        self.sections.iter().find(|s| s.name == name)
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        let mut output = String::new();

        for section in &self.sections {
            if section.properties.is_empty() {
                continue;
            }

            if let Some(ref comment) = section.comment {
                output.push_str(&format!("{} {}\n", self.comment_char, comment));
            }

            output.push_str(&format!("[{}]\n", section.name));

            for prop in &section.properties {
                if let Some(ref comment) = prop.comment {
                    output.push_str(&format!("{} {}\n", self.comment_char, comment));
                }

                if self.write_spacing {
                    output.push_str(&format!("{} = {}\n", prop.name, prop.value));
                } else {
                    output.push_str(&format!("{}={}\n", prop.name, prop.value));
                }
            }

            output.push('\n');
        }

        fs::write(path, output).map_err(|e| format!("Failed to save INI file: {}", e))
    }

    pub fn to_map(&self) -> HashMap<String, HashMap<String, String>> {
        self.sections
            .iter()
            .map(|s| (s.name.clone(), s.to_map()))
            .collect()
    }
}

pub struct SettingsStore {
    ini: Mutex<IniFile>,
    file_path: PathBuf,
}

impl SettingsStore {
    pub fn new(file_path: PathBuf) -> Self {
        let ini = if file_path.exists() {
            IniFile::load(&file_path)
        } else {
            IniFile::new()
        };

        let store = Self {
            ini: Mutex::new(ini),
            file_path,
        };

        store.apply_defaults();
        store
    }

    fn apply_defaults(&self) {
        let mut ini = self.ini.lock().unwrap();

        let defaults: &[(&str, &str, Option<&str>)] = &[
            ("CheckForUpdates", "true", None),
            ("AccountJoinDelay", "8", None),
            ("AsyncJoin", "false", None),
            ("DisableAgingAlert", "false", None),
            ("HideUsernames", "false", None),
            ("SavePasswords", "true", None),
            (
                "ServerRegionFormat",
                "<city>, <countryCode>",
                Some("Visit http://ip-api.com/json/1.1.1.1 to see available format options"),
            ),
            ("MaxRecentGames", "8", None),
            ("ShuffleChoosesLowestServer", "false", None),
            ("ShufflePageCount", "5", None),
            ("IPApiLink", "http://ip-api.com/json/<ip>", None),
            ("WindowScale", "1.0", None),
            ("ScaleFonts", "true", None),
            ("AutoCookieRefresh", "true", None),
            ("AutoCloseLastProcess", "true", None),
            ("ShowPresence", "true", None),
            ("PresenceUpdateRate", "5", None),
            ("WarnOnOnlineJoin", "true", None),
            ("UnlockFPS", "false", None),
            ("MaxFPSValue", "120", None),
            ("CustomClientSettings", "", None),
            ("UseCefSharpBrowser", "false", None),
            ("StartOnPCStartup", "false", None),
            ("MinimizeToTray", "false", None),
        ];

        let general = ini.section("General");
        for (key, value, comment) in defaults {
            if !general.exists(key) {
                general.set(key, value, *comment);
            }
        }

        let developer = ini.section("Developer");
        if !developer.exists("DevMode") {
            developer.set("DevMode", "false", None);
        }
        if !developer.exists("EnableWebServer") {
            developer.set("EnableWebServer", "false", None);
        }
        if !developer.exists("IsTeleport") {
            developer.set("IsTeleport", "false", None);
        }
        if !developer.exists("UseOldJoin") {
            developer.set("UseOldJoin", "false", None);
        }
        if !developer.exists("CurrentVersion") {
            developer.set("CurrentVersion", "", None);
        }

        let ws_defaults: &[(&str, &str)] = &[
            ("WebServerPort", "7963"),
            ("AllowGetCookie", "false"),
            ("AllowGetAccounts", "false"),
            ("AllowLaunchAccount", "false"),
            ("AllowAccountEditing", "false"),
            ("EveryRequestRequiresPassword", "false"),
            ("AllowExternalConnections", "false"),
        ];

        let webserver = ini.section("WebServer");
        for (key, value) in ws_defaults {
            if !webserver.exists(key) {
                webserver.set(key, value, None);
            }
        }

        let ac_defaults: &[(&str, &str)] = &[
            ("AllowExternalConnections", "false"),
            ("StartOnLaunch", "false"),
            ("SaveOutput", "false"),
            ("RelaunchDelay", "60"),
            ("LauncherDelay", "9"),
            ("LauncherDelayNumber", "9"),
            ("NexusPort", "5242"),
            ("AutoMinimizeEnabled", "false"),
            ("AutoCloseEnabled", "false"),
            ("InternetCheck", "false"),
            ("UsePresence", "false"),
            ("AutoMinimizeInterval", "15"),
            ("AutoCloseInterval", "5"),
            ("MaxInstances", "3"),
            ("AutoCloseType", "0"),
        ];

        let account_control = ini.section("AccountControl");
        for (key, value) in ac_defaults {
            if !account_control.exists(key) {
                account_control.set(key, value, None);
            }
        }
        if !account_control.exists("LauncherDelay") && account_control.exists("LauncherDelayNumber") {
            if let Some(val) = account_control.get("LauncherDelayNumber").map(|v| v.to_string()) {
                account_control.set("LauncherDelay", &val, None);
            }
        }

        let watcher_defaults: &[(&str, &str)] = &[
            ("Enabled", "false"),
            ("ScanInterval", "6"),
            ("ReadInterval", "250"),
            ("ExitIfNoConnection", "false"),
            ("NoConnectionTimeout", "60"),
            ("ExitOnBeta", "false"),
            ("VerifyDataModel", "true"),
            ("IgnoreExistingProcesses", "true"),
            ("CloseRbxMemory", "false"),
            ("MemoryLowValue", "200"),
            ("CloseRbxWindowTitle", "false"),
            ("ExpectedWindowTitle", "Roblox"),
            ("SaveWindowPositions", "false"),
        ];

        let watcher = ini.section("Watcher");
        for (key, value) in watcher_defaults {
            if !watcher.exists(key) {
                watcher.set(key, value, None);
            }
        }

        ini.section("Prompts");

        drop(ini);
        let _ = self.save();
    }

    pub fn save(&self) -> Result<(), String> {
        let ini = self.ini.lock().map_err(|e| e.to_string())?;
        ini.save(&self.file_path)
    }

    pub fn get_all(&self) -> Result<HashMap<String, HashMap<String, String>>, String> {
        let ini = self.ini.lock().map_err(|e| e.to_string())?;
        Ok(ini.to_map())
    }

    pub fn get(&self, section: &str, key: &str) -> Result<Option<String>, String> {
        let ini = self.ini.lock().map_err(|e| e.to_string())?;
        Ok(ini
            .get_section(section)
            .and_then(|s| s.get(key))
            .map(|v| v.to_string()))
    }

    pub fn get_bool(&self, section: &str, key: &str) -> bool {
        self.get(section, key)
            .ok()
            .flatten()
            .map(|v| v == "true")
            .unwrap_or(false)
    }

    pub fn get_int(&self, section: &str, key: &str) -> Option<i64> {
        self.get(section, key)
            .ok()
            .flatten()
            .and_then(|v| v.parse().ok())
    }

    pub fn get_float(&self, section: &str, key: &str) -> Option<f64> {
        self.get(section, key)
            .ok()
            .flatten()
            .and_then(|v| v.parse().ok())
    }

    pub fn get_string(&self, section: &str, key: &str) -> String {
        self.get(section, key).ok().flatten().unwrap_or_default()
    }

    pub fn set(&self, section: &str, key: &str, value: &str) -> Result<(), String> {
        let mut ini = self.ini.lock().map_err(|e| e.to_string())?;
        ini.section(section).set(key, value, None);
        drop(ini);
        self.save()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeData {
    pub accounts_background: String,
    pub accounts_foreground: String,
    pub buttons_background: String,
    pub buttons_foreground: String,
    pub buttons_border: String,
    pub forms_background: String,
    pub forms_foreground: String,
    pub textboxes_background: String,
    pub textboxes_foreground: String,
    pub textboxes_border: String,
    pub label_background: String,
    pub label_foreground: String,
    pub label_transparent: bool,
    pub dark_top_bar: bool,
    pub show_headers: bool,
    pub light_images: bool,
    pub button_style: String,
}

impl Default for ThemeData {
    fn default() -> Self {
        Self {
            accounts_background: "#09090B".to_string(),
            accounts_foreground: "#E4E4E7".to_string(),
            buttons_background: "#27272A".to_string(),
            buttons_foreground: "#A1A1AA".to_string(),
            buttons_border: "#3F3F46".to_string(),
            forms_background: "#09090B".to_string(),
            forms_foreground: "#E4E4E7".to_string(),
            textboxes_background: "#18181B".to_string(),
            textboxes_foreground: "#D4D4D8".to_string(),
            textboxes_border: "#27272A".to_string(),
            label_background: "#09090B".to_string(),
            label_foreground: "#71717A".to_string(),
            label_transparent: true,
            dark_top_bar: true,
            show_headers: true,
            light_images: false,
            button_style: "Flat".to_string(),
        }
    }
}

pub struct ThemeStore {
    data: Mutex<ThemeData>,
    file_path: PathBuf,
}

impl ThemeStore {
    pub fn new(file_path: PathBuf) -> Self {
        let data = if file_path.exists() {
            Self::load_from_file(&file_path)
        } else {
            ThemeData::default()
        };

        Self {
            data: Mutex::new(data),
            file_path,
        }
    }

    fn load_from_file(path: &Path) -> ThemeData {
        let ini = IniFile::load(path);
        let mut data = ThemeData::default();

        let section = ini
            .get_section("Roblox Account Manager")
            .or_else(|| ini.get_section("RBX Alt Manager"));

        if let Some(s) = section {
            if let Some(v) = s.get("AccountsBG") {
                data.accounts_background = v.to_string();
            }
            if let Some(v) = s.get("AccountsFG") {
                data.accounts_foreground = v.to_string();
            }
            if let Some(v) = s.get("ButtonsBG") {
                data.buttons_background = v.to_string();
            }
            if let Some(v) = s.get("ButtonsFG") {
                data.buttons_foreground = v.to_string();
            }
            if let Some(v) = s.get("ButtonsBC") {
                data.buttons_border = v.to_string();
            }
            if let Some(v) = s.get("FormsBG") {
                data.forms_background = v.to_string();
            }
            if let Some(v) = s.get("FormsFG") {
                data.forms_foreground = v.to_string();
            }
            if let Some(v) = s.get("TextBoxesBG") {
                data.textboxes_background = v.to_string();
            }
            if let Some(v) = s.get("TextBoxesFG") {
                data.textboxes_foreground = v.to_string();
            }
            if let Some(v) = s.get("TextBoxesBC") {
                data.textboxes_border = v.to_string();
            }
            if let Some(v) = s.get("LabelsBC") {
                data.label_background = v.to_string();
            }
            if let Some(v) = s.get("LabelsFC") {
                data.label_foreground = v.to_string();
            }
            if let Some(v) = s.get("LabelsTransparent") {
                data.label_transparent = v.eq_ignore_ascii_case("true");
            }
            if let Some(v) = s.get("DarkTopBar") {
                data.dark_top_bar = v.eq_ignore_ascii_case("true");
            }
            if let Some(v) = s.get("ShowHeaders") {
                data.show_headers = v.eq_ignore_ascii_case("true");
            }
            if let Some(v) = s.get("LightImages") {
                data.light_images = v.eq_ignore_ascii_case("true");
            }
            if let Some(v) = s.get("ButtonStyle") {
                data.button_style = v.to_string();
            }
        }

        data
    }

    pub fn get(&self) -> Result<ThemeData, String> {
        let data = self.data.lock().map_err(|e| e.to_string())?;
        Ok(data.clone())
    }

    pub fn save(&self) -> Result<(), String> {
        let data = self.data.lock().map_err(|e| e.to_string())?;
        let mut ini = IniFile::new();
        let section = ini.section("Roblox Account Manager");

        section.set("AccountsBG", &data.accounts_background, None);
        section.set("AccountsFG", &data.accounts_foreground, None);
        section.set("ButtonsBG", &data.buttons_background, None);
        section.set("ButtonsFG", &data.buttons_foreground, None);
        section.set("ButtonsBC", &data.buttons_border, None);
        section.set("FormsBG", &data.forms_background, None);
        section.set("FormsFG", &data.forms_foreground, None);
        section.set("TextBoxesBG", &data.textboxes_background, None);
        section.set("TextBoxesFG", &data.textboxes_foreground, None);
        section.set("TextBoxesBC", &data.textboxes_border, None);
        section.set("LabelsBC", &data.label_background, None);
        section.set("LabelsFC", &data.label_foreground, None);
        section.set(
            "LabelsTransparent",
            if data.label_transparent {
                "true"
            } else {
                "false"
            },
            None,
        );
        section.set(
            "DarkTopBar",
            if data.dark_top_bar { "true" } else { "false" },
            None,
        );
        section.set(
            "ShowHeaders",
            if data.show_headers { "true" } else { "false" },
            None,
        );
        section.set(
            "LightImages",
            if data.light_images { "true" } else { "false" },
            None,
        );
        section.set("ButtonStyle", &data.button_style, None);

        ini.save(&self.file_path)
    }

    pub fn update(&self, theme: ThemeData) -> Result<(), String> {
        let mut data = self.data.lock().map_err(|e| e.to_string())?;
        *data = theme;
        drop(data);
        self.save()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemePresetData {
    pub id: String,
    pub name: String,
    pub theme: ThemeData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ThemePresetExportFile {
    format: String,
    name: String,
    theme: ThemeData,
}

pub struct ThemePresetStore {
    presets: Mutex<Vec<ThemePresetData>>,
    file_path: PathBuf,
}

impl ThemePresetStore {
    pub fn new(file_path: PathBuf) -> Self {
        let presets = Self::load_from_file(&file_path);
        Self {
            presets: Mutex::new(presets),
            file_path,
        }
    }

    fn load_from_file(path: &Path) -> Vec<ThemePresetData> {
        if !path.exists() {
            return Vec::new();
        }

        let raw = match fs::read_to_string(path) {
            Ok(v) => v,
            Err(_) => return Vec::new(),
        };

        serde_json::from_str::<Vec<ThemePresetData>>(&raw).unwrap_or_default()
    }

    fn save_all(&self, presets: &[ThemePresetData]) -> Result<(), String> {
        let payload =
            serde_json::to_string_pretty(presets).map_err(|e| format!("Failed to serialize presets: {}", e))?;
        fs::write(&self.file_path, payload)
            .map_err(|e| format!("Failed to write preset file {}: {}", self.file_path.display(), e))
    }

    fn sanitize_preset_name(name: &str) -> String {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return "Custom Preset".to_string();
        }
        trimmed.to_string()
    }

    fn make_preset_id(name: &str) -> String {
        let mut slug = String::new();
        for ch in name.chars() {
            if ch.is_ascii_alphanumeric() {
                slug.push(ch.to_ascii_lowercase());
            } else if ch == ' ' || ch == '-' || ch == '_' {
                if !slug.ends_with('-') {
                    slug.push('-');
                }
            }
        }
        let base = slug.trim_matches('-');
        let safe = if base.is_empty() { "preset" } else { base };
        format!("{}-{}", safe, chrono::Utc::now().timestamp_millis())
    }

    fn sanitize_file_stem(name: &str) -> String {
        let mut out = String::new();
        for ch in name.chars() {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                out.push(ch);
            } else if ch == ' ' {
                out.push('-');
            }
        }
        let trimmed = out.trim_matches('-');
        if trimmed.is_empty() {
            "theme-preset".to_string()
        } else {
            trimmed.to_string()
        }
    }

    pub fn get_all(&self) -> Result<Vec<ThemePresetData>, String> {
        let presets = self.presets.lock().map_err(|e| e.to_string())?;
        Ok(presets.clone())
    }

    pub fn save_preset(&self, name: &str, theme: ThemeData) -> Result<ThemePresetData, String> {
        let normalized_name = Self::sanitize_preset_name(name);
        let mut presets = self.presets.lock().map_err(|e| e.to_string())?;

        if let Some(existing) = presets
            .iter_mut()
            .find(|p| p.name.eq_ignore_ascii_case(&normalized_name))
        {
            existing.name = normalized_name.clone();
            existing.theme = theme;
            let result = existing.clone();
            let snapshot = presets.clone();
            drop(presets);
            self.save_all(&snapshot)?;
            return Ok(result);
        }

        let preset = ThemePresetData {
            id: Self::make_preset_id(&normalized_name),
            name: normalized_name,
            theme,
        };
        presets.push(preset.clone());
        let snapshot = presets.clone();
        drop(presets);
        self.save_all(&snapshot)?;
        Ok(preset)
    }

    pub fn delete_preset(&self, preset_id: &str) -> Result<(), String> {
        let mut presets = self.presets.lock().map_err(|e| e.to_string())?;
        let before = presets.len();
        presets.retain(|p| p.id != preset_id);
        if before == presets.len() {
            return Err(format!("Preset '{}' not found", preset_id));
        }
        let snapshot = presets.clone();
        drop(presets);
        self.save_all(&snapshot)
    }

    pub fn import_preset_file(&self, path: &str) -> Result<ThemePresetData, String> {
        let raw = fs::read_to_string(path).map_err(|e| format!("Failed to read preset file: {}", e))?;
        let value: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| format!("Invalid preset JSON: {}", e))?;

        let (name, theme) = if let Some(theme_value) = value.get("theme") {
            let parsed_theme: ThemeData = serde_json::from_value(theme_value.clone())
                .map_err(|e| format!("Invalid preset theme payload: {}", e))?;
            let parsed_name = value
                .get("name")
                .and_then(|n| n.as_str())
                .map(|n| n.to_string())
                .unwrap_or_default();
            (parsed_name, parsed_theme)
        } else {
            let parsed_theme: ThemeData =
                serde_json::from_value(value).map_err(|e| format!("Invalid theme data: {}", e))?;
            (String::new(), parsed_theme)
        };

        let fallback_name = Path::new(path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Imported Preset")
            .to_string();
        let chosen_name = if name.trim().is_empty() {
            fallback_name
        } else {
            name
        };

        self.save_preset(&chosen_name, theme)
    }

    pub fn export_preset_file(name: &str, theme: ThemeData) -> Result<String, String> {
        let normalized_name = Self::sanitize_preset_name(name);
        let stem = Self::sanitize_file_stem(&normalized_name);
        let base_dir = get_runtime_data_dir();
        let mut out_path = base_dir.join(format!("{}.ram-theme.json", stem));

        if out_path.exists() {
            let suffix = chrono::Utc::now().format("%Y%m%d-%H%M%S");
            out_path = base_dir.join(format!("{}-{}.ram-theme.json", stem, suffix));
        }

        let payload = ThemePresetExportFile {
            format: "ram-theme-preset-v1".to_string(),
            name: normalized_name,
            theme,
        };

        let json = serde_json::to_string_pretty(&payload)
            .map_err(|e| format!("Failed to serialize exported preset: {}", e))?;
        fs::write(&out_path, json)
            .map_err(|e| format!("Failed to write preset export {}: {}", out_path.display(), e))?;
        Ok(out_path.to_string_lossy().into_owned())
    }
}

fn get_runtime_data_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
}

pub fn get_settings_path() -> PathBuf {
    get_runtime_data_dir().join("RAMSettings.ini")
}

pub fn get_theme_path() -> PathBuf {
    get_runtime_data_dir().join("RAMTheme.ini")
}

pub fn get_theme_presets_path() -> PathBuf {
    get_runtime_data_dir().join("RAMThemePresets.json")
}

#[tauri::command]
pub fn get_all_settings(
    state: tauri::State<'_, SettingsStore>,
) -> Result<HashMap<String, HashMap<String, String>>, String> {
    state.get_all()
}

#[tauri::command]
pub fn get_setting(
    state: tauri::State<'_, SettingsStore>,
    section: String,
    key: String,
) -> Result<Option<String>, String> {
    state.get(&section, &key)
}

#[tauri::command]
pub fn update_setting(
    state: tauri::State<'_, SettingsStore>,
    section: String,
    key: String,
    value: String,
) -> Result<(), String> {
    state.set(&section, &key, &value)
}

#[tauri::command]
pub fn get_theme(state: tauri::State<'_, ThemeStore>) -> Result<ThemeData, String> {
    state.get()
}

#[tauri::command]
pub fn update_theme(state: tauri::State<'_, ThemeStore>, theme: ThemeData) -> Result<(), String> {
    state.update(theme)
}

#[tauri::command]
pub fn get_theme_presets(state: tauri::State<'_, ThemePresetStore>) -> Result<Vec<ThemePresetData>, String> {
    state.get_all()
}

#[tauri::command]
pub fn save_theme_preset(
    state: tauri::State<'_, ThemePresetStore>,
    name: String,
    theme: ThemeData,
) -> Result<ThemePresetData, String> {
    state.save_preset(&name, theme)
}

#[tauri::command]
pub fn delete_theme_preset(
    state: tauri::State<'_, ThemePresetStore>,
    preset_id: String,
) -> Result<(), String> {
    state.delete_preset(&preset_id)
}

#[tauri::command]
pub fn import_theme_preset_file(
    state: tauri::State<'_, ThemePresetStore>,
    path: String,
) -> Result<ThemePresetData, String> {
    state.import_preset_file(&path)
}

#[tauri::command]
pub fn export_theme_preset_file(name: String, theme: ThemeData) -> Result<String, String> {
    ThemePresetStore::export_preset_file(&name, theme)
}
