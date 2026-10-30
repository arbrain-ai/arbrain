// pdfjs-dist trae el worker ya cableado para webpack en este módulo, pero no declara tipos para él.
declare module 'pdfjs-dist/webpack.mjs' {
  export * from 'pdfjs-dist'
}
