// Sustituto de 'pdfjs-dist/webpack.mjs' en el arnés: el bundle iife no resuelve `new URL('./build/pdf.worker.mjs', import.meta.url)`;
// el worker lo entrega el servidor de prueba en /pdf.worker.mjs.
import { GlobalWorkerOptions } from 'pdfjs-dist'
GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'
export * from 'pdfjs-dist'
