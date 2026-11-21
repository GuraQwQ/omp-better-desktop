use serde_json::{Value, json};
use std::path::Path;
use tauri::{Manager, Theme, window::Color};

pub(crate) struct Appearance {
    pub theme: Option<Theme>,
    pub background: Color,
    preferences: Value,
}

pub(crate) fn valid_palette(value: &Value) -> bool {
    matches!(
        value.as_str(),
        Some("obsidian" | "classic" | "claude" | "omp" | "custom")
    )
}

pub(crate) fn valid_accents(value: &Value) -> bool {
    value.as_object().is_some_and(|colors| colors.len() == 2)
        && ["light", "dark"].iter().all(|mode| {
            value[*mode].as_str().is_some_and(|color| {
                color.strip_prefix('#').is_some_and(|hex| {
                    hex.len() == 6 && hex.bytes().all(|byte| byte.is_ascii_hexdigit())
                })
            })
        })
}

impl Appearance {
    pub fn read(root: &Path) -> Self {
        Self::from_preferences(&crate::config(root).unwrap_or_default()["preferences"])
    }

    fn from_preferences(value: &Value) -> Self {
        let (mode, theme) = match value["theme"].as_str() {
            Some("dark") => ("dark", Some(Theme::Dark)),
            Some("system") => ("system", None),
            _ => ("light", Some(Theme::Light)),
        };
        let palette = if valid_palette(&value["palette"]) {
            value["palette"].as_str().unwrap()
        } else {
            "obsidian"
        };
        let dark = theme.map_or_else(system_is_dark, |theme| theme == Theme::Dark);
        let background = match (palette, dark) {
            ("classic", false) => Color(0xfc, 0xfc, 0xfb, 255),
            ("classic", true) => Color(0x15, 0x17, 0x14, 255),
            ("claude", false) => Color(0xfa, 0xf9, 0xf5, 255),
            ("claude", true) => Color(0x14, 0x14, 0x13, 255),
            ("omp", false) => Color(0xf8, 0xf8, 0xf8, 255),
            ("omp", true) => Color(0x15, 0x18, 0x20, 255),
            (_, false) => Color(0xf5, 0xf5, 0xf7, 255),
            (_, true) => Color(0x1c, 0x1c, 0x1e, 255),
        };
        let accents = &value["customAccent"];
        let custom = valid_accents(accents).then_some(accents);
        Self {
            theme,
            background,
            preferences: json!({"theme": mode, "palette": palette, "customAccent": custom}),
        }
    }

    pub fn boot_script(&self) -> String {
        format!("window.ompStartupAppearance = {};", self.preferences)
    }
}

#[cfg(windows)]
fn system_is_dark() -> bool {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
        .and_then(|key| key.get_value::<u32, _>("AppsUseLightTheme"))
        .is_ok_and(|value| value == 0)
}

#[cfg(not(windows))]
fn system_is_dark() -> bool {
    false
}

pub(crate) fn apply(app: &tauri::AppHandle, preferences: &Value) {
    let appearance = Appearance::from_preferences(preferences);
    for (label, window) in app.webview_windows() {
        let card = label.starts_with("card-");
        if label != "main" && !card && !label.starts_with("omp-login-") {
            continue;
        }
        if let Err(error) = window.set_theme(appearance.theme) {
            eprintln!("同步窗口主题失败 ({label}): {error}");
        }
        if let Err(error) = window.set_background_color(Some(appearance.background)) {
            eprintln!("同步窗口底色失败 ({label}): {error}");
        }
        if card
            && let Err(error) = window.eval(format!(
                "window.ompApplyAppearance?.({});",
                appearance.preferences
            ))
        {
            eprintln!("同步任务卡配色失败 ({label}): {error}");
        }
    }
}
