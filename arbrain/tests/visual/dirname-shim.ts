// Algún módulo que arrastra ModalAjustes lee __dirname al cargarse; en el navegador no existe.
;(globalThis as { __dirname?: string }).__dirname ??= '/'
export {}
