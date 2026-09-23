//! mpv lives and dies with NetsuCast. mpv is a separate process: when NetsuCast is killed (the
//! installer closes it before an update, a crash, the task manager), it would stay behind with
//! its files locked and the update would fail on "cannot write mpv.exe". A Windows job object
//! with KILL_ON_JOB_CLOSE ends it, and yt-dlp and Deno under it, as soon as NetsuCast's handle to
//! the job goes away, whatever way NetsuCast ends.

/// Puts the process `pid` (mpv) in NetsuCast's job. The job handle is never closed by hand: the
/// system closes it when NetsuCast exits, and that is the signal.
#[tauri::command]
pub fn bind_to_app(pid: u32) -> Result<(), String> {
    imp::bind(pid)
}

#[cfg(windows)]
mod imp {
    use std::sync::OnceLock;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

    /// The job, as a raw handle value (HANDLE is not Send).
    pub(super) static JOB: OnceLock<usize> = OnceLock::new();

    fn job() -> Result<usize, String> {
        if let Some(job) = JOB.get() {
            return Ok(*job);
        }
        let job = unsafe { CreateJobObjectW(None, PCWSTR::null()) }.map_err(|e| e.to_string())?;
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        unsafe {
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        }
        .map_err(|e| e.to_string())?;
        Ok(*JOB.get_or_init(|| job.0 as usize))
    }

    pub fn bind(pid: u32) -> Result<(), String> {
        let job = windows::Win32::Foundation::HANDLE(job()? as *mut core::ffi::c_void);
        let process = unsafe { OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid) }.map_err(|e| e.to_string())?;
        let result = unsafe { AssignProcessToJobObject(job, process) }.map_err(|e| e.to_string());
        let _ = unsafe { CloseHandle(process) };
        result
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn bind(_pid: u32) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(all(test, windows))]
mod tests {
    use std::process::Command;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::JobObjects::IsProcessInJob;
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

    #[test]
    fn a_bound_process_joins_the_job() {
        let mut child = Command::new("cmd").args(["/c", "ping -n 30 127.0.0.1 >nul"]).spawn().unwrap();
        super::bind_to_app(child.id()).unwrap();
        let mut inside = windows::core::BOOL(0);
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, child.id()).unwrap();
            let job = windows::Win32::Foundation::HANDLE(*super::imp::JOB.get().unwrap() as *mut core::ffi::c_void);
            IsProcessInJob(process, Some(job), &mut inside).unwrap();
            let _ = CloseHandle(process);
        }
        let _ = child.kill();
        assert!(inside.as_bool());
    }
}
