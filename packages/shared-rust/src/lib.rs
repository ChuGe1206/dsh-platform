//! shared-rust — shared types and JSON helpers for the dsh-platform native
//! shells (Tauri desktop / mobile). Mirrors `packages/shared-bridge` wire
//! types so Rust and TypeScript agree on the protocol without codegen.

pub mod bridge;

pub use bridge::{BridgeError, BridgeRequest, BridgeResponse, PROTOCOL_VERSION as ProtocolVersion};
