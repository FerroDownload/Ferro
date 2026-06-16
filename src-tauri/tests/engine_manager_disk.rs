use ferro_lib::engine::engine_manager::{check_disk_space, EngineManagerError};
use fs4::available_space;

#[test]
fn disk_space_check_fails_when_insufficient() {
    let dir = match tempfile::tempdir() {
        Ok(dir) => dir,
        Err(error) => panic!("temp dir error: {error}"),
    };
    let available = match available_space(dir.path()) {
        Ok(available) => available,
        Err(error) => panic!("available space error: {error}"),
    };
    let required = available.saturating_add(1);

    let error = match check_disk_space(dir.path(), required) {
        Ok(_) => panic!("expected insufficient disk error"),
        Err(error) => error,
    };

    match error {
        EngineManagerError::InsufficientDisk {
            required_bytes,
            available_bytes,
        } => {
            assert_eq!(required_bytes, required);
            assert!(
                available_bytes < required,
                "available bytes should remain below the requested byte count"
            );
        }
        _ => panic!("expected InsufficientDisk"),
    }
}
