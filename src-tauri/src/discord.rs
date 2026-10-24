//! Discord Rich Presence: "Watching <title>" on the user's profile, with the show's cover.
//!
//! Same local protocol as NetsuRush (core/discordRpc.js), without a library: Discord listens on
//! the named pipes `\\?\pipe\discord-ipc-0` … `-9` (one per running client: Stable, PTB, Canary),
//! and a frame is `[opcode u32 LE][length u32 LE][JSON]`, written in one write.
//!   0 HANDSHAKE {v: 1, client_id} → Discord answers with READY.
//!   1 FRAME {cmd: "SET_ACTIVITY", args: {pid, activity}} → Discord answers each command.
//! SET_ACTIVITY is capped at one every 15 s and Discord silently drops the extra ones, so only the
//! latest wanted activity is kept and sent once the window is open again.
//!
//! One thread owns the pipe and only reads right after it writes: a synchronous pipe handle
//! serializes its reads and writes, so a reader thread would block every write. Discord not
//! running is the normal case: nothing fails loudly, the thread retries in the background.
//!
//! The interface builds the activity (src/hooks/useDiscordPresence.ts) and sends it here; `null`
//! clears it.

use serde_json::{json, Value};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

/// The NetsuCast application on the Discord developer portal. Public: it is the OAuth client id,
/// and it names the application and its art assets.
const CLIENT_ID: &str = "1563668733107503124";

const OP_HANDSHAKE: u32 = 0;
const OP_FRAME: u32 = 1;
const THROTTLE: Duration = Duration::from_secs(15);
const RETRY_MIN: Duration = Duration::from_secs(2);
const RETRY_MAX: Duration = Duration::from_secs(60);
/// Discord refuses frames bigger than this; anything near it is a bug on our side.
const MAX_FRAME: u32 = 64 * 1024;

pub struct DiscordState(Mutex<Sender<Option<Value>>>);

impl DiscordState {
    pub fn start() -> Self {
        let (tx, rx) = channel::<Option<Value>>();
        thread::spawn(move || {
            let mut pipe: Option<File> = None;
            // What the interface wants on the profile, and whether Discord has it yet.
            let mut wanted: Option<Value> = None;
            let mut dirty = false;
            let mut last_sent: Option<Instant> = None;
            let mut retry = RETRY_MIN;
            let mut retry_at: Option<Instant> = None;
            loop {
                let now = Instant::now();
                let wait = if !dirty {
                    Duration::from_secs(3600)
                } else {
                    let throttle_end = last_sent.map(|t| t + THROTTLE).unwrap_or(now);
                    let ready_at = retry_at.map_or(throttle_end, |r| r.max(throttle_end));
                    ready_at.saturating_duration_since(now)
                };
                match rx.recv_timeout(wait) {
                    Ok(activity) => {
                        wanted = activity;
                        dirty = true;
                        // More messages may already be queued: keep only the last one.
                        while let Ok(next) = rx.try_recv() {
                            wanted = next;
                        }
                        continue;
                    }
                    Err(RecvTimeoutError::Disconnected) => return,
                    Err(RecvTimeoutError::Timeout) => {}
                }
                if !dirty {
                    continue;
                }
                if pipe.is_none() && wanted.is_none() {
                    // Nothing to clear: without a pipe the profile shows nothing already.
                    dirty = false;
                    continue;
                }
                if pipe.is_none() {
                    pipe = connect();
                    if pipe.is_none() {
                        retry_at = Some(Instant::now() + retry);
                        retry = (retry * 2).min(RETRY_MAX);
                        continue;
                    }
                    retry = RETRY_MIN;
                    retry_at = None;
                }
                let frame = json!({
                    "cmd": "SET_ACTIVITY",
                    "args": { "pid": std::process::id(), "activity": wanted },
                    "nonce": nonce(),
                });
                let sent = pipe.as_mut().is_some_and(|p| send(p, OP_FRAME, &frame) && receive(p).is_some());
                if sent {
                    last_sent = Some(Instant::now());
                    dirty = false;
                } else {
                    // Discord closed or restarted: reconnect and send again.
                    pipe = None;
                    retry_at = Some(Instant::now() + retry);
                }
                // Nothing to show: let go of the pipe, the profile is clear once it closes.
                if !dirty && wanted.is_none() {
                    pipe = None;
                }
            }
        });
        Self(Mutex::new(tx))
    }
}

fn nonce() -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    format!("{}-{}", t.as_nanos(), std::process::id())
}

fn connect() -> Option<File> {
    for i in 0..10 {
        let Ok(mut pipe) = OpenOptions::new().read(true).write(true).open(format!(r"\\?\pipe\discord-ipc-{i}")) else {
            continue;
        };
        if send(&mut pipe, OP_HANDSHAKE, &json!({ "v": 1, "client_id": CLIENT_ID })) {
            // READY, or an error frame (wrong client id): only READY means the pipe is Discord's.
            if receive(&mut pipe).is_some_and(|(_, v)| v["evt"] == "READY") {
                return Some(pipe);
            }
        }
    }
    None
}

fn send(pipe: &mut File, op: u32, body: &Value) -> bool {
    let body = body.to_string();
    let mut frame = Vec::with_capacity(8 + body.len());
    frame.extend_from_slice(&op.to_le_bytes());
    frame.extend_from_slice(&(body.len() as u32).to_le_bytes());
    frame.extend_from_slice(body.as_bytes());
    pipe.write_all(&frame).and_then(|_| pipe.flush()).is_ok()
}

fn receive(pipe: &mut File) -> Option<(u32, Value)> {
    let mut header = [0u8; 8];
    pipe.read_exact(&mut header).ok()?;
    let op = u32::from_le_bytes(header[0..4].try_into().ok()?);
    let len = u32::from_le_bytes(header[4..8].try_into().ok()?);
    if len > MAX_FRAME {
        return None;
    }
    let mut body = vec![0u8; len as usize];
    pipe.read_exact(&mut body).ok()?;
    Some((op, serde_json::from_slice(&body).ok()?))
}

/// The activity to show, or `null` to clear it. Sent as often as the interface likes: only the
/// latest reaches Discord, at most every 15 s.
#[tauri::command]
pub fn discord_set_activity(state: tauri::State<DiscordState>, activity: Option<Value>) {
    let _ = state.0.lock().unwrap().send(activity);
}
