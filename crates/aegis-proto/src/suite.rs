use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum SuiteId {
    DemoXChaCha20Poly1305,
    HybridPqPlaceholder,
}

impl SuiteId {
    pub fn as_str(&self) -> &'static str {
        match self {
            SuiteId::DemoXChaCha20Poly1305 => "AMP-DEMO-XCHACHA20POLY1305",
            SuiteId::HybridPqPlaceholder => "AMP-HYBRID-PQ-PLACEHOLDER",
        }
    }
}
