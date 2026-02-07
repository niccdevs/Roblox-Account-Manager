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
            accounts_background: "#1E1E2E".to_string(),
            accounts_foreground: "#CDD6F4".to_string(),
            buttons_background: "#313244".to_string(),
            buttons_foreground: "#CDD6F4".to_string(),
            buttons_border: "#45475A".to_string(),
            forms_background: "#1E1E2E".to_string(),
            forms_foreground: "#CDD6F4".to_string(),
            textboxes_background: "#313244".to_string(),
            textboxes_foreground: "#CDD6F4".to_string(),
            textboxes_border: "#45475A".to_string(),
            label_background: "#1E1E2E".to_string(),
            label_foreground: "#CDD6F4".to_string(),
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

pub fn get_settings_path() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
        .join("RAMSettings.ini")
}

pub fn get_theme_path() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
        .join("RAMTheme.ini")
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
