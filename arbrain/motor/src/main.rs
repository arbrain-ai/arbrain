//! `arbrain-motor [--relevo | --estado]`
//!  (sin flags)  arranca el motor en su socket; si ya hay uno vivo, sale.
//!  --relevo     toma las PTYs del motor vivo y lo retira SIN matar (actualizar el motor).
//!  --estado     imprime el `info` del motor vivo en JSON.
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cfg = arbrain_motor::config_from_env();
    if args.iter().any(|a| a == "--estado") {
        match arbrain_motor::client::info(&cfg.sock) {
            Ok(v) => println!("{v}"),
            Err(e) => {
                eprintln!("{e}");
                std::process::exit(1);
            }
        }
        return;
    }
    if args.iter().any(|a| a == "--relevo") {
        if let Err(e) = arbrain_motor::server::run_relevo(cfg) {
            eprintln!("relevo: {e}");
            std::process::exit(1);
        }
        return;
    }
    arbrain_motor::server::run(cfg);
}
