use std::collections::HashMap;

pub fn environment() -> Vec<(String, String)> {
    let inherited: HashMap<_, _> = std::env::vars()
        .filter(|(key, _)| {
            matches!(
                key.to_ascii_uppercase().as_str(),
                "HTTP_PROXY" | "HTTPS_PROXY" | "ALL_PROXY" | "NO_PROXY"
            )
        })
        .map(|(key, value)| (key.to_ascii_uppercase(), value))
        .collect();
    if inherited.keys().any(|key| key != "NO_PROXY") {
        return Vec::new();
    }
    #[cfg(windows)]
    {
        use winreg::{RegKey, enums::HKEY_CURRENT_USER};
        let Ok(settings) = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        else {
            return Vec::new();
        };
        if settings.get_value::<u32, _>("ProxyEnable").unwrap_or(0) != 1 {
            return Vec::new();
        }
        let server = settings
            .get_value::<String, _>("ProxyServer")
            .unwrap_or_default();
        let bypass = settings
            .get_value::<String, _>("ProxyOverride")
            .unwrap_or_default();
        return windows_proxy(
            &server,
            &bypass,
            inherited.get("NO_PROXY").map(String::as_str),
        );
    }
    #[cfg(not(windows))]
    Vec::new()
}

#[cfg(windows)]
fn windows_proxy(
    server: &str,
    bypass: &str,
    existing_bypass: Option<&str>,
) -> Vec<(String, String)> {
    let entries: HashMap<_, _> = server
        .split(';')
        .filter_map(|entry| entry.split_once('='))
        .map(|(protocol, address)| (protocol.trim().to_ascii_lowercase(), address.trim()))
        .collect();
    let mut values = Vec::new();
    for protocol in ["http", "https"] {
        let address = if entries.is_empty() {
            Some(server.trim())
        } else {
            entries.get(protocol).copied()
        };
        if let Some(address) = address.filter(|address| !address.is_empty()) {
            let url = if address.contains("://") {
                address.to_owned()
            } else {
                format!("http://{address}")
            };
            values.push((format!("{}_PROXY", protocol.to_ascii_uppercase()), url));
        }
    }
    if values.is_empty() {
        return values;
    }
    if existing_bypass.is_none() {
        let mut hosts = vec![
            "localhost".to_owned(),
            "127.0.0.0/8".to_owned(),
            "::1".to_owned(),
        ];
        for host in bypass
            .split(';')
            .map(str::trim)
            .filter(|host| !host.is_empty() && *host != "<local>")
        {
            // Bun 的 NO_PROXY 不识别 Windows 的 IPv4 星号，用等价网段保留本地绕行。
            let host = if let Some(prefix) = host.strip_suffix(".*") {
                let octets: Vec<_> = prefix.split('.').collect();
                if octets.len() <= 3 && octets.iter().all(|part| part.parse::<u8>().is_ok()) {
                    format!(
                        "{}{}/{}",
                        prefix,
                        ".0".repeat(4 - octets.len()),
                        octets.len() * 8
                    )
                } else {
                    host.to_owned()
                }
            } else {
                host.to_owned()
            };
            if !hosts.contains(&host) {
                hosts.push(host);
            }
        }
        values.push(("NO_PROXY".into(), hosts.join(",")));
    }
    values
}
