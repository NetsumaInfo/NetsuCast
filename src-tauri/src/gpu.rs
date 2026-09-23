//! The graphics card mpv will render on, for the automatic model choice and to tell when the
//! compiled shaders no longer match (new card, new driver).

use serde::Serialize;

/// Below this much dedicated video memory the card is treated as integrated (APUs report a small
/// carve-out of system memory) and gets the lighter model.
const STRONG_MIN_MB: u64 = 3500;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    pub name: String,
    pub vendor_id: u32,
    pub dedicated_mb: u64,
    /// "32.0.15.6094" style, from the user-mode driver version.
    pub driver: String,
    /// A discrete card with enough memory for C4F32 DS.
    pub strong: bool,
}

/// The adapter with the most dedicated memory: libplacebo picks the discrete GPU the same way on
/// hybrid laptops. Software renderers are skipped; `None` when only those exist.
#[cfg(windows)]
pub fn detect() -> Option<Gpu> {
    use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIDevice, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE};
    use windows::core::Interface;

    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }.ok()?;
    let mut best: Option<Gpu> = None;
    for index in 0.. {
        let Ok(adapter) = (unsafe { factory.EnumAdapters1(index) }) else { break };
        let Ok(desc) = (unsafe { adapter.GetDesc1() }) else { continue };
        if desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 || desc.VendorId == 0x1414 {
            continue; // Microsoft Basic Render Driver
        }
        let dedicated_mb = desc.DedicatedVideoMemory as u64 / (1024 * 1024);
        if best.as_ref().is_some_and(|b| b.dedicated_mb >= dedicated_mb) {
            continue;
        }
        let name_len = desc.Description.iter().position(|&c| c == 0).unwrap_or(desc.Description.len());
        let driver = unsafe { adapter.CheckInterfaceSupport(&IDXGIDevice::IID) }
            .map(|v| {
                let v = v as u64;
                format!("{}.{}.{}.{}", v >> 48, (v >> 32) & 0xffff, (v >> 16) & 0xffff, v & 0xffff)
            })
            .unwrap_or_default();
        best = Some(Gpu {
            name: String::from_utf16_lossy(&desc.Description[..name_len]).trim().to_string(),
            vendor_id: desc.VendorId,
            dedicated_mb,
            driver,
            strong: dedicated_mb >= STRONG_MIN_MB,
        });
    }
    best
}

#[cfg(not(windows))]
pub fn detect() -> Option<Gpu> {
    None
}

