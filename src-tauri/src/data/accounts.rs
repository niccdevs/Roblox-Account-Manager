use crate::data::crypto;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Account {
    pub valid: bool,
    pub security_token: String,
    pub username: String,
    #[serde(with = "csharp_datetime")]
    pub last_use: DateTime<Utc>,
    #[serde(rename = "Alias")]
    pub alias: String,
    #[serde(rename = "Description")]
    pub description: String,
    #[serde(rename = "Password")]
    pub password: String,
    #[serde(default = "default_group", skip_serializing_if = "is_default_group")]
    pub group: String,
    #[serde(rename = "UserID")]
    pub user_id: i64,
    #[serde(default)]
    pub fields: HashMap<String, String>,
    #[serde(with = "csharp_datetime")]
    pub last_attempted_refresh: DateTime<Utc>,
    #[serde(rename = "BrowserTrackerID", alias = "BrowserTrackerId", default)]
    pub browser_tracker_id: String,
}

fn default_group() -> String {
    "Default".to_string()
}

fn is_default_group(group: &String) -> bool {
    group == "Default"
}

mod csharp_datetime {
    use chrono::{DateTime, TimeZone, Utc};
    use serde::{self, Deserialize, Deserializer, Serializer};

    const FORMAT: &str = "%Y-%m-%dT%H:%M:%S%.f";

    pub fn serialize<S>(date: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let s = date.format(FORMAT).to_string();
        serializer.serialize_str(&s)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;

        if let Ok(dt) = DateTime::parse_from_rfc3339(&s) {
            return Ok(dt.with_timezone(&Utc));
        }

        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, FORMAT) {
            return Ok(Utc.from_utc_datetime(&dt));
        }

        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%dT%H:%M:%S") {
            return Ok(Utc.from_utc_datetime(&dt));
        }

        Err(serde::de::Error::custom(format!(
            "Failed to parse datetime: {}",
            s
        )))
    }
}

impl Default for Account {
    fn default() -> Self {
        Self {
            valid: false,
            security_token: String::new(),
            username: String::new(),
            last_use: Utc::now(),
            alias: String::new(),
            description: String::new(),
            password: String::new(),
            group: default_group(),
            user_id: 0,
            fields: HashMap::new(),
            last_attempted_refresh: Utc::now(),
            browser_tracker_id: String::new(),
        }
    }
}

impl Account {
    pub fn new(security_token: String, username: String, user_id: i64) -> Self {
        Self {
            valid: true,
            security_token,
            username,
            user_id,
            last_use: Utc::now(),
            ..Default::default()
        }
    }

    pub fn get_field(&self, name: &str) -> Option<&String> {
        self.fields.get(name)
    }

    pub fn set_field(&mut self, name: String, value: String) {
        self.fields.insert(name, value);
    }

    pub fn remove_field(&mut self, name: &str) {
        self.fields.remove(name);
    }
}

pub struct AccountStore {
    accounts: Mutex<Vec<Account>>,
    password_hash: Mutex<Option<Vec<u8>>>,
    file_path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OldAccountImportSummary {
    pub total: usize,
    pub added: usize,
    pub replaced: usize,
    pub skipped: usize,
}

const IMPORT_PASSWORD_REQUIRED: &str = "IMPORT_PASSWORD_REQUIRED";

impl AccountStore {
    pub fn new(file_path: PathBuf) -> Self {
        Self {
            accounts: Mutex::new(Vec::new()),
            password_hash: Mutex::new(None),
            file_path,
        }
    }

    pub fn is_encrypted(&self) -> Result<bool, String> {
        if !self.file_path.exists() {
            return Ok(false);
        }

        let data =
            fs::read(&self.file_path).map_err(|e| format!("Failed to read account file: {}", e))?;

        Ok(crypto::is_encrypted(&data))
    }

    pub fn needs_password(&self) -> Result<bool, String> {
        let password_hash = self.password_hash.lock().map_err(|e| e.to_string())?;
        if password_hash.is_some() {
            return Ok(false);
        }
        self.is_encrypted()
    }

    pub fn load(&self) -> Result<(), String> {
        if !self.file_path.exists() {
            return Ok(());
        }

        let data =
            fs::read(&self.file_path).map_err(|e| format!("Failed to read account file: {}", e))?;

        if data.is_empty() {
            return Ok(());
        }

        let accounts = self.decode_accounts_for_load(&data)?;

        let mut store = self.accounts.lock().map_err(|e| e.to_string())?;
        *store = accounts;

        Ok(())
    }

    pub fn load_with_password(&self, password: &str) -> Result<(), String> {
        let hash = crypto::hash_password(password);
        if !self.file_path.exists() {
            let mut password_hash = self.password_hash.lock().map_err(|e| e.to_string())?;
            *password_hash = Some(hash);
            return Ok(());
        }

        let data =
            fs::read(&self.file_path).map_err(|e| format!("Failed to read account file: {}", e))?;

        if data.is_empty() {
            let mut accounts = self.accounts.lock().map_err(|e| e.to_string())?;
            *accounts = Vec::new();
            drop(accounts);
            let mut password_hash = self.password_hash.lock().map_err(|e| e.to_string())?;
            *password_hash = Some(hash);
            return Ok(());
        }

        let accounts = if crypto::is_encrypted(&data) {
            let decrypted =
                crypto::decrypt(&data, &hash).map_err(|e| format!("Failed to decrypt: {}", e))?;
            serde_json::from_slice::<Vec<Account>>(&decrypted)
                .map_err(|e| format!("Failed to parse account JSON: {}", e))?
        } else {
            Self::decode_plain_or_legacy_accounts(&data)?
        };

        let mut store = self.accounts.lock().map_err(|e| e.to_string())?;
        *store = accounts;
        drop(store);

        let mut password_hash = self.password_hash.lock().map_err(|e| e.to_string())?;
        *password_hash = Some(hash);
        Ok(())
    }

    pub fn save(&self) -> Result<(), String> {
        let accounts = self.accounts.lock().map_err(|e| e.to_string())?;

        let json = serde_json::to_string_pretty(&*accounts)
            .map_err(|e| format!("Failed to serialize accounts: {}", e))?;

        let password_hash = self.password_hash.lock().map_err(|e| e.to_string())?;

        let data = if let Some(hash) = password_hash.as_ref() {
            crypto::encrypt(&json, hash).map_err(|e| format!("Failed to encrypt: {}", e))?
        } else {
            json.into_bytes()
        };

        fs::write(&self.file_path, data)
            .map_err(|e| format!("Failed to write account file: {}", e))?;

        Ok(())
    }

    pub fn set_password(&self, password: Option<&str>) -> Result<(), String> {
        if let Some(value) = password {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return Err("Password cannot be empty".to_string());
            }
            if trimmed.chars().count() < 8 {
                return Err("Password must be at least 8 characters".to_string());
            }
        }
        let mut password_hash = self.password_hash.lock().map_err(|e| e.to_string())?;
        *password_hash = password.map(|p| crypto::hash_password(p.trim()));
        drop(password_hash);
        self.save()
    }

    pub fn get_all(&self) -> Result<Vec<Account>, String> {
        let accounts = self.accounts.lock().map_err(|e| e.to_string())?;
        Ok(accounts.clone())
    }

    pub fn add(&self, account: Account) -> Result<(), String> {
        let mut accounts = self.accounts.lock().map_err(|e| e.to_string())?;

        if let Some(existing) = accounts.iter_mut().find(|a| a.user_id == account.user_id) {
            existing.security_token = account.security_token;
            existing.username = account.username;
            existing.valid = account.valid;
            existing.last_use = account.last_use;
        } else {
            accounts.push(account);
        }

        drop(accounts);
        self.save()
    }

    pub fn remove(&self, user_id: i64) -> Result<bool, String> {
        let mut accounts = self.accounts.lock().map_err(|e| e.to_string())?;
        let initial_len = accounts.len();
        accounts.retain(|a| a.user_id != user_id);
        let removed = accounts.len() < initial_len;

        drop(accounts);
        if removed {
            self.save()?;
        }

        Ok(removed)
    }

    pub fn update(&self, account: Account) -> Result<bool, String> {
        let mut accounts = self.accounts.lock().map_err(|e| e.to_string())?;

        if let Some(existing) = accounts.iter_mut().find(|a| a.user_id == account.user_id) {
            *existing = account;
            drop(accounts);
            self.save()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn reorder(&self, user_ids: &[i64]) -> Result<(), String> {
        let mut accounts = self.accounts.lock().map_err(|e| e.to_string())?;

        if accounts.is_empty() || user_ids.is_empty() {
            return Ok(());
        }

        let mut ordered = Vec::with_capacity(accounts.len());

        for user_id in user_ids {
            if let Some(pos) = accounts.iter().position(|a| a.user_id == *user_id) {
                ordered.push(accounts.remove(pos));
            }
        }

        ordered.append(&mut accounts);
        *accounts = ordered;

        drop(accounts);
        self.save()
    }

    fn decode_plain_or_legacy_accounts(data: &[u8]) -> Result<Vec<Account>, String> {
        if let Ok(accounts) = serde_json::from_slice::<Vec<Account>>(data) {
            return Ok(accounts);
        }

        if let Some(legacy_decrypted) = crypto::try_decrypt_legacy_dpapi(data) {
            return serde_json::from_slice::<Vec<Account>>(&legacy_decrypted)
                .map_err(|e| format!("Failed to parse account JSON: {}", e));
        }

        Err("Invalid account data format (failed plaintext and legacy DPAPI decode)".to_string())
    }

    fn decode_accounts_for_load(&self, data: &[u8]) -> Result<Vec<Account>, String> {
        if data.is_empty() {
            return Ok(Vec::new());
        }

        if crypto::is_encrypted(data) {
            let password_hash = self.password_hash.lock().map_err(|e| e.to_string())?;
            let hash = password_hash
                .as_ref()
                .ok_or_else(|| "Password required for encrypted file".to_string())?;
            let decrypted =
                crypto::decrypt(data, hash).map_err(|e| format!("Failed to decrypt: {}", e))?;
            return serde_json::from_slice::<Vec<Account>>(&decrypted)
                .map_err(|e| format!("Failed to parse account JSON: {}", e));
        }

        Self::decode_plain_or_legacy_accounts(data)
    }

    fn decode_accounts_for_import(
        &self,
        data: &[u8],
        import_password: Option<&str>,
    ) -> Result<Vec<Account>, String> {
        if data.is_empty() {
            return Ok(Vec::new());
        }

        if crypto::is_encrypted(data) {
            let Some(password) = import_password else {
                return Err(IMPORT_PASSWORD_REQUIRED.to_string());
            };
            let hash = crypto::hash_password(password);
            let decrypted = crypto::decrypt(data, &hash)
                .map_err(|_| "Import password is incorrect".to_string())?;
            return serde_json::from_slice::<Vec<Account>>(&decrypted)
                .map_err(|e| format!("Failed to parse account JSON: {}", e));
        }

        Self::decode_plain_or_legacy_accounts(data)
    }

    pub fn import_old_account_data(
        &self,
        data: &[u8],
        import_password: Option<&str>,
    ) -> Result<OldAccountImportSummary, String> {
        let imported_accounts = self.decode_accounts_for_import(data, import_password)?;
        let total = imported_accounts.len();
        let mut skipped = 0usize;

        let mut imported_by_user_id: HashMap<i64, Account> = HashMap::new();
        let mut imported_order: Vec<i64> = Vec::new();

        for account in imported_accounts {
            let user_id = account.user_id;
            if user_id <= 0 {
                skipped += 1;
                continue;
            }

            if imported_by_user_id.contains_key(&user_id) {
                skipped += 1;
            } else {
                imported_order.push(user_id);
            }
            imported_by_user_id.insert(user_id, account);
        }

        let mut accounts = self.accounts.lock().map_err(|e| e.to_string())?;
        let mut current_index_by_user_id: HashMap<i64, usize> = accounts
            .iter()
            .enumerate()
            .map(|(idx, account)| (account.user_id, idx))
            .collect();

        let mut added = 0usize;
        let mut replaced = 0usize;

        for user_id in imported_order {
            let Some(account) = imported_by_user_id.remove(&user_id) else {
                continue;
            };
            if let Some(existing_index) = current_index_by_user_id.get(&user_id).copied() {
                accounts[existing_index] = account;
                replaced += 1;
            } else {
                let next_index = accounts.len();
                current_index_by_user_id.insert(user_id, next_index);
                accounts.push(account);
                added += 1;
            }
        }

        let mut seen_user_ids = HashSet::new();
        accounts.retain(|account| seen_user_ids.insert(account.user_id));

        drop(accounts);

        if added > 0 || replaced > 0 {
            self.save()?;
        }

        Ok(OldAccountImportSummary {
            total,
            added,
            replaced,
            skipped,
        })
    }
}

pub fn get_account_data_path() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
        .join("AccountData.json")
}

#[tauri::command]
pub fn get_accounts(state: tauri::State<'_, AccountStore>) -> Result<Vec<Account>, String> {
    state.get_all()
}

#[tauri::command]
pub fn save_accounts(state: tauri::State<'_, AccountStore>) -> Result<(), String> {
    state.save()
}

#[tauri::command]
pub fn add_account(
    state: tauri::State<'_, AccountStore>,
    security_token: String,
    username: String,
    user_id: i64,
) -> Result<(), String> {
    let account = Account::new(security_token, username, user_id);
    state.add(account)
}

#[tauri::command]
pub fn remove_account(state: tauri::State<'_, AccountStore>, user_id: i64) -> Result<bool, String> {
    state.remove(user_id)
}

#[tauri::command]
pub fn update_account(
    state: tauri::State<'_, AccountStore>,
    account: Account,
) -> Result<bool, String> {
    state.update(account)
}

#[tauri::command]
pub fn unlock_accounts(
    state: tauri::State<'_, AccountStore>,
    password: String,
) -> Result<(), String> {
    state.load_with_password(&password)
}

#[tauri::command]
pub fn is_accounts_encrypted(state: tauri::State<'_, AccountStore>) -> Result<bool, String> {
    state.is_encrypted()
}

#[tauri::command]
pub fn needs_password(state: tauri::State<'_, AccountStore>) -> Result<bool, String> {
    state.needs_password()
}

#[tauri::command]
pub fn set_encryption_password(
    state: tauri::State<'_, AccountStore>,
    password: Option<String>,
) -> Result<(), String> {
    state.set_password(password.as_deref())
}

#[tauri::command]
pub fn reorder_accounts(
    state: tauri::State<'_, AccountStore>,
    user_ids: Vec<i64>,
) -> Result<(), String> {
    state.reorder(&user_ids)
}

#[tauri::command]
pub fn import_old_account_data(
    state: tauri::State<'_, AccountStore>,
    file_data: Vec<u8>,
    password: Option<String>,
) -> Result<OldAccountImportSummary, String> {
    state.import_old_account_data(&file_data, password.as_deref())
}
