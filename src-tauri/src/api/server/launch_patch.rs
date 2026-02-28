fn patch_client_settings_for_launch(settings: &SettingsStore) {
    use crate::platform::windows;

    let custom_settings = settings.get_string("General", "CustomClientSettings");
    let custom_settings = custom_settings.trim();
    let mut custom_applied = false;

    if !custom_settings.is_empty()
        && std::path::Path::new(custom_settings).exists()
        && windows::copy_custom_client_settings(custom_settings).is_ok()
    {
        custom_applied = true;
    }

    let max_fps = if !custom_applied && settings.get_bool("General", "UnlockFPS") {
        settings
            .get_int("General", "MaxFPSValue")
            .filter(|fps| *fps > 0)
            .map(|fps| fps as u32)
    } else {
        None
    };

    let master_volume = if settings.get_bool("General", "OverrideClientVolume") {
        Some(
            settings
                .get_float("General", "ClientVolume")
                .unwrap_or(0.5)
                .clamp(0.0, 1.0) as f32,
        )
    } else {
        None
    };

    let graphics_level = if settings.get_bool("General", "OverrideClientGraphics") {
        let level = settings.get_int("General", "ClientGraphicsLevel").unwrap_or(10);
        if level > 0 {
            Some(level.clamp(1, 10) as u32)
        } else {
            None
        }
    } else {
        None
    };

    let window_size = if settings.get_bool("General", "OverrideClientWindowSize") {
        match (
            settings.get_int("General", "ClientWindowWidth"),
            settings.get_int("General", "ClientWindowHeight"),
        ) {
            (Some(w), Some(h)) if w > 0 && h > 0 => Some((w as u32, h as u32)),
            _ => None,
        }
    } else {
        None
    };

    let _ = windows::apply_runtime_client_settings(max_fps, master_volume, graphics_level, window_size);
}
