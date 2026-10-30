//! Tamaño de la ventana al abrir (29 oct 2026, un fundador en Windows con pantalla de 1280×720: la ventana fija de
//! 1360×880 no cabía y el botón de la bienvenida quedaba debajo de la barra de tareas, sin forma de llegar a él).
//!
//! La ventana nace con el tamaño ideal si cabe en el área útil del monitor (la pantalla sin la barra de tareas ni el
//! Dock) y, si no, con lo que quepa, centrada. El mínimo de siempre (880×600) solo se exige cuando cabe: en una
//! pantalla más chica el mínimo baja al tamaño inicial para que nunca quede nada fuera de la pantalla.
//! `medidas` es pura (la prueban las pruebas de abajo); `area_util` pregunta al sistema.

/// Tamaño ideal y mínimo en píxeles lógicos.
pub const IDEAL: (f64, f64) = (1360.0, 880.0);
pub const MINIMO: (f64, f64) = (880.0, 600.0);
/// Lo que suman la barra de título y los bordes del sistema alrededor del área de la web.
const MARCO: (f64, f64) = (16.0, 40.0);
/// Aire entre la ventana y el borde del área útil.
const MARGEN: f64 = 8.0;

/// Rectángulo en píxeles lógicos.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Area {
    pub x: f64,
    pub y: f64,
    pub ancho: f64,
    pub alto: f64,
}

/// Tamaño interior (el área de la web), mínimo y posición del marco exterior, todo lógico.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Medidas {
    pub ancho: f64,
    pub alto: f64,
    pub min_ancho: f64,
    pub min_alto: f64,
    pub posicion: Option<(f64, f64)>,
}

/// Sin área conocida, lo de siempre (el sistema decide dónde).
pub fn medidas(area: Option<Area>) -> Medidas {
    let Some(a) = area.filter(|a| a.ancho > 0.0 && a.alto > 0.0) else {
        return Medidas { ancho: IDEAL.0, alto: IDEAL.1, min_ancho: MINIMO.0, min_alto: MINIMO.1, posicion: None };
    };
    let cabe_ancho = (a.ancho - MARCO.0 - 2.0 * MARGEN).floor().max(320.0);
    let cabe_alto = (a.alto - MARCO.1 - 2.0 * MARGEN).floor().max(240.0);
    let ancho = IDEAL.0.min(cabe_ancho);
    let alto = IDEAL.1.min(cabe_alto);
    let min_ancho = MINIMO.0.min(ancho);
    let min_alto = MINIMO.1.min(alto);
    let x = a.x + ((a.ancho - ancho - MARCO.0) / 2.0).max(0.0);
    let y = a.y + ((a.alto - alto - MARCO.1) / 2.0).max(0.0);
    Medidas { ancho, alto, min_ancho, min_alto, posicion: Some((x.round(), y.round())) }
}

/// Área útil del monitor principal en píxeles lógicos. Windows: la que deja la barra de tareas (SPI_GETWORKAREA, en
/// píxeles físicos porque tao declara la app consciente de los DPI). Otros sistemas: la pantalla entera menos una
/// franja para la barra de menú y el Dock.
pub fn area_util<T>(ventana: &tao::event_loop::EventLoopWindowTarget<T>) -> Option<Area> {
    let monitor = ventana.primary_monitor().or_else(|| ventana.available_monitors().next())?;
    let escala = monitor.scale_factor();
    if escala.is_nan() || escala <= 0.0 {
        return None;
    }
    #[cfg(windows)]
    if let Some((x, y, ancho, alto)) = area_trabajo_windows() {
        return Some(Area { x: x / escala, y: y / escala, ancho: ancho / escala, alto: alto / escala });
    }
    let tam = monitor.size();
    let pos = monitor.position();
    let franja = if cfg!(target_os = "macos") { 100.0 } else { 48.0 };
    Some(Area {
        x: pos.x as f64 / escala,
        y: pos.y as f64 / escala,
        ancho: tam.width as f64 / escala,
        alto: (tam.height as f64 / escala - franja).max(0.0),
    })
}

#[cfg(windows)]
fn area_trabajo_windows() -> Option<(f64, f64, f64, f64)> {
    #[repr(C)]
    struct Rect {
        izq: i32,
        arriba: i32,
        der: i32,
        abajo: i32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn SystemParametersInfoW(accion: u32, param: u32, datos: *mut core::ffi::c_void, ini: u32) -> i32;
    }
    const SPI_GETWORKAREA: u32 = 0x0030;
    let mut r = Rect { izq: 0, arriba: 0, der: 0, abajo: 0 };
    // SAFETY: SPI_GETWORKAREA escribe un RECT en el puntero que se le da; `r` vive durante la llamada.
    let ok = unsafe { SystemParametersInfoW(SPI_GETWORKAREA, 0, (&mut r as *mut Rect).cast(), 0) };
    (ok != 0 && r.der > r.izq && r.abajo > r.arriba).then(|| (r.izq as f64, r.arriba as f64, (r.der - r.izq) as f64, (r.abajo - r.arriba) as f64))
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn pantalla_grande_tamano_ideal_centrado() {
        let m = medidas(Some(Area { x: 0.0, y: 0.0, ancho: 1920.0, alto: 1032.0 }));
        assert_eq!((m.ancho, m.alto, m.min_ancho, m.min_alto), (1360.0, 880.0, 880.0, 600.0));
        assert_eq!(m.posicion, Some((272.0, 56.0)));
    }

    #[test]
    fn pantalla_de_1280x720_cabe_entera() {
        // 1280×720 con la barra de tareas de Windows (48): área útil 1280×672.
        let a = Area { x: 0.0, y: 0.0, ancho: 1280.0, alto: 672.0 };
        let m = medidas(Some(a));
        assert!(m.ancho + MARCO.0 <= a.ancho && m.alto + MARCO.1 <= a.alto, "{m:?}");
        assert_eq!((m.ancho, m.alto), (1248.0, 616.0));
        assert_eq!((m.min_ancho, m.min_alto), (880.0, 600.0));
        let (x, y) = m.posicion.unwrap();
        assert!(x >= 0.0 && y >= 0.0 && x + m.ancho + MARCO.0 <= a.ancho && y + m.alto + MARCO.1 <= a.alto);
    }

    #[test]
    fn pantalla_mas_chica_que_el_minimo_baja_el_minimo() {
        let m = medidas(Some(Area { x: 0.0, y: 0.0, ancho: 1024.0, alto: 552.0 }));
        assert_eq!((m.alto, m.min_alto), (496.0, 496.0));
        assert!(m.min_ancho <= m.ancho && m.min_alto <= m.alto);
    }

    #[test]
    fn respeta_el_origen_del_area() {
        // Barra de tareas arriba o a la izquierda: el área útil no empieza en 0,0.
        let m = medidas(Some(Area { x: 60.0, y: 40.0, ancho: 1220.0, alto: 680.0 }));
        let (x, y) = m.posicion.unwrap();
        assert!(x >= 60.0 && y >= 40.0);
    }

    #[test]
    fn sin_area_lo_de_siempre() {
        let m = medidas(None);
        assert_eq!((m.ancho, m.alto, m.posicion), (1360.0, 880.0, None));
    }
}
