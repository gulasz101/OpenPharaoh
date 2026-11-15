use wasm_bindgen::prelude::*;

/// Returns the combined version string from pharaoh-assets.
#[wasm_bindgen]
pub fn version() -> String {
    format!("pharaoh-web {}", pharaoh_assets::version())
}
