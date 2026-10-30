use serde::Serialize;
use std::{fs, io::Read, path::{Path, PathBuf}};

const MAX_BYTES: u64 = 4_000_000;

#[derive(Serialize)]
pub struct ChatImage { name: String, mime: &'static str, bytes: Vec<u8> }

fn mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") { Some("image/png") }
    else if bytes.starts_with(&[0xff, 0xd8, 0xff]) { Some("image/jpeg") }
    else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") { Some("image/gif") }
    else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") { Some("image/webp") }
    else { None }
}

fn read_image(path: &Path, roots: &[PathBuf]) -> Result<ChatImage, String> {
    if !path.is_absolute() { return Err("Adjunta una ruta absoluta o usa el clip.".into()); }
    let canonical = fs::canonicalize(path).map_err(|_| "No se encontró la captura. Vuelve a copiarla o adjúntala con el clip.")?;
    if !roots.iter().filter_map(|root| fs::canonicalize(root).ok()).any(|root| canonical.starts_with(root)) {
        return Err("Esa ubicación no admite pegado de rutas. Selecciona la imagen con el clip.".into());
    }
    let ext = canonical.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
    if !["png", "jpg", "jpeg", "webp", "gif"].contains(&ext.as_str()) { return Err("El archivo debe ser una imagen PNG, JPEG, WebP o GIF.".into()); }
    let file = fs::File::open(&canonical).map_err(|_| "No se pudo abrir la captura.")?;
    let meta = file.metadata().map_err(|_| "No se pudo comprobar la captura.")?;
    if !meta.is_file() || meta.len() > MAX_BYTES { return Err("Cada captura puede tener hasta 4 MB. Exporta una versión más pequeña.".into()); }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes).map_err(|_| "No se pudo leer la captura.")?;
    if bytes.len() as u64 > MAX_BYTES { return Err("La captura supera 4 MB.".into()); }
    let mime = mime(&bytes).ok_or("El contenido del archivo no es una imagen admitida.")?;
    Ok(ChatImage { name: canonical.file_name().unwrap().to_string_lossy().into_owned(), mime, bytes })
}

// Only the desktop UI calls this when the user pastes an image path. No HTTP endpoint
// and no deliberative tool. Canonical roots also reject symlinks escaping these folders.
#[tauri::command]
pub fn read_chat_image(path: String) -> Result<ChatImage, String> {
    let home = PathBuf::from(std::env::var("HOME").map_err(|_| "No se encontró tu carpeta de usuario.")?);
    let roots = [home.join("Library/Application Support/CleanShot/media"), home.join("Downloads"), home.join("Desktop"), home.join("Pictures"), std::env::temp_dir()];
    read_image(Path::new(&path), &roots)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_image_bytes_not_extension() {
        assert_eq!(mime(b"\x89PNG\r\n\x1a\n"), Some("image/png"));
        assert_eq!(mime(b"GIF89a"), Some("image/gif"));
        assert_eq!(mime(b"RIFF1234WEBP"), Some("image/webp"));
        assert_eq!(mime(&[0xff,0xd8,0xff]), Some("image/jpeg"));
        assert_eq!(mime(b"password disguised as screenshot.png"), None);
    }
    #[test]
    fn restricts_files_and_bounds_size() {
        let root = std::env::temp_dir().join(format!("chat-image-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("allowed")).unwrap();
        let roots = [root.join("allowed")];
        let inside = roots[0].join("shot.png");
        fs::write(&inside, b"\x89PNG\r\n\x1a\n").unwrap();
        assert_eq!(read_image(&inside, &roots).unwrap().bytes.len(), 8);
        let outside = root.join("outside.png");
        fs::write(&outside, b"\x89PNG\r\n\x1a\n").unwrap();
        assert!(read_image(&outside, &roots).is_err());
        #[cfg(unix)] { let link = roots[0].join("link.png"); std::os::unix::fs::symlink(&outside, &link).unwrap(); assert!(read_image(&link, &roots).is_err()); }
        fs::write(&inside, b"not an image").unwrap();
        assert!(read_image(&inside, &roots).is_err());
        fs::File::create(&inside).unwrap().set_len(MAX_BYTES + 1).unwrap();
        assert!(read_image(&inside, &roots).is_err());
        assert!(read_image(Path::new("shot.png"), &roots).is_err());
        fs::remove_dir_all(&root).unwrap();
    }
}
