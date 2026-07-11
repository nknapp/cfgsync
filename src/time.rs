use chrono::{DateTime, Utc};

/// Returns the current time.
///
/// When compiled with `--features faketime`, the `FAKETIME` env var can be set
/// to a file path containing milliseconds since epoch to override the real time.
#[cfg(feature = "faketime")]
pub fn now() -> DateTime<Utc> {
    let ms = faketime::unix_time_as_millis();
    DateTime::from_timestamp_millis(ms as i64).unwrap_or_default()
}

#[cfg(not(feature = "faketime"))]
pub fn now() -> DateTime<Utc> {
    chrono::Utc::now()
}

/// Set the mtime of a symlink (does not follow the link).
/// Uses `utimensat` with `AT_SYMLINK_NOFOLLOW`.
#[cfg(feature = "faketime")]
pub fn set_symlink_mtime(path: &std::path::Path, time: DateTime<Utc>) {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let millis = time.timestamp_millis();
    let secs = (millis / 1000) as i64;
    let nsecs = ((millis % 1000) * 1_000_000) as i64;
    let times = [
        libc::timespec {
            tv_sec: secs,
            tv_nsec: nsecs,
        },
        libc::timespec {
            tv_sec: secs,
            tv_nsec: nsecs,
        },
    ];

    let path_cstr =
        CString::new(path.as_os_str().as_bytes()).expect("path should not contain null bytes");
    unsafe {
        libc::utimensat(
            libc::AT_FDCWD,
            path_cstr.as_ptr(),
            times.as_ptr(),
            libc::AT_SYMLINK_NOFOLLOW,
        );
    }
}
