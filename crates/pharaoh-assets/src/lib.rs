/// Returns the crate version as a static string.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_returns_crate_version() {
        let v = version();
        assert!(!v.is_empty(), "version should not be empty");
        // env!("CARGO_PKG_VERSION") is the crate version, so this must match.
        assert_eq!(v, "0.1.0");
    }
}
