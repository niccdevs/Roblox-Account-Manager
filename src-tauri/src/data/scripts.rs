use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct ScriptPermissions {
    pub allow_invoke: bool,
    pub allow_http: bool,
    #[serde(rename = "allowWebSocket", alias = "allowWebsocket")]
    pub allow_websocket: bool,
    pub allow_window: bool,
    pub allow_modal: bool,
    pub allow_settings: bool,
    pub allow_ui: bool,
}

impl Default for ScriptPermissions {
    fn default() -> Self {
        Self {
            allow_invoke: true,
            allow_http: true,
            allow_websocket: true,
            allow_window: true,
            allow_modal: true,
            allow_settings: true,
            allow_ui: true,
        }
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn default_language() -> String {
    "javascript".to_string()
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedScript {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default)]
    pub source: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub trusted: bool,
    #[serde(default)]
    pub auto_start: bool,
    #[serde(default)]
    pub permissions: ScriptPermissions,
    #[serde(default = "now_ms")]
    pub created_at_ms: i64,
    #[serde(default = "now_ms")]
    pub updated_at_ms: i64,
}

pub struct ScriptStore {
    scripts: Mutex<Vec<ManagedScript>>,
    file_path: PathBuf,
}

impl ScriptStore {
    pub fn new(file_path: PathBuf) -> Self {
        let store = Self {
            scripts: Mutex::new(Vec::new()),
            file_path,
        };
        let _ = store.load_from_disk();
        store
    }

    fn load_from_disk(&self) -> Result<(), String> {
        if !self.file_path.exists() {
            return Ok(());
        }

        let data =
            fs::read(&self.file_path).map_err(|e| format!("Failed to read scripts file: {}", e))?;
        if data.is_empty() {
            return Ok(());
        }

        let parsed = serde_json::from_slice::<Vec<ManagedScript>>(&data)
            .map_err(|e| format!("Failed to parse scripts file: {}", e))?;

        let mut scripts = self.scripts.lock().map_err(|e| e.to_string())?;
        *scripts = parsed;
        Ok(())
    }

    fn save_to_disk(&self) -> Result<(), String> {
        let scripts = self.scripts.lock().map_err(|e| e.to_string())?;
        let bytes = serde_json::to_vec_pretty(&*scripts)
            .map_err(|e| format!("Failed to serialize scripts: {}", e))?;
        fs::write(&self.file_path, bytes)
            .map_err(|e| format!("Failed to write scripts file: {}", e))?;
        Ok(())
    }

    pub fn get_all(&self) -> Result<Vec<ManagedScript>, String> {
        let mut scripts = self.scripts.lock().map_err(|e| e.to_string())?.clone();
        scripts.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(scripts)
    }

    pub fn upsert(&self, mut script: ManagedScript) -> Result<ManagedScript, String> {
        let id = script.id.trim();
        if id.is_empty() {
            return Err("Script id is required".to_string());
        }
        script.id = id.to_string();

        let name = script.name.trim();
        if name.is_empty() {
            return Err("Script name is required".to_string());
        }
        script.name = name.to_string();

        if script.language.trim().is_empty() {
            script.language = default_language();
        }

        let mut scripts = self.scripts.lock().map_err(|e| e.to_string())?;
        let now = now_ms();

        if let Some(existing) = scripts.iter_mut().find(|s| s.id == script.id) {
            let created = existing.created_at_ms;
            *existing = script;
            existing.created_at_ms = created;
            existing.updated_at_ms = now;
            let out = existing.clone();
            drop(scripts);
            self.save_to_disk()?;
            return Ok(out);
        }

        script.created_at_ms = now;
        script.updated_at_ms = now;
        scripts.push(script.clone());
        drop(scripts);
        self.save_to_disk()?;
        Ok(script)
    }

    pub fn remove(&self, script_id: &str) -> Result<bool, String> {
        let mut scripts = self.scripts.lock().map_err(|e| e.to_string())?;
        let before = scripts.len();
        scripts.retain(|s| s.id != script_id);
        let removed = scripts.len() < before;
        drop(scripts);
        if removed {
            self.save_to_disk()?;
        }
        Ok(removed)
    }
}

pub fn get_scripts_path() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
        .join("RAMScripts.json")
}

#[tauri::command]
pub fn get_scripts(state: tauri::State<'_, ScriptStore>) -> Result<Vec<ManagedScript>, String> {
    state.get_all()
}

#[tauri::command]
pub fn save_script(
    state: tauri::State<'_, ScriptStore>,
    script: ManagedScript,
) -> Result<ManagedScript, String> {
    state.upsert(script)
}

#[tauri::command]
pub fn delete_script(
    state: tauri::State<'_, ScriptStore>,
    script_id: String,
) -> Result<bool, String> {
    state.remove(&script_id)
}
