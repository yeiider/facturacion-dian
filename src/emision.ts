import { comprimir, nombreArchivo, type PrefijoArchivo } from './dian/archivos.js';
import type { Certificado } from './firma/certificado.js';
import { firmarXades } from './firma/xades.js';
import { generarFactura, generarNota, type DocumentoGenerado, type TipoDocumento } from './ubl/documento.js';
import type { Configuracion, FacturaInput, NotaInput } from './types.js';

export interface DocumentoListo extends DocumentoGenerado {
  xmlFirmado: string;
  nombreXml: string;
  nombreZip: string;
  zipBase64: string;
}

const PREFIJO: Record<TipoDocumento, PrefijoArchivo> = { factura: 'fv', 'nota-credito': 'nc', 'nota-debito': 'nd' };

/**
 * Genera, firma y comprime un documento, dejándolo listo para enviar a la DIAN.
 * `consecutivoArchivo` es el consecutivo propio de archivos enviados en el año (se usa en el nombre del ZIP).
 */
export async function prepararDocumento(
  doc: DocumentoGenerado,
  nitEmisor: string,
  cert: Certificado,
  consecutivoArchivo: number,
): Promise<DocumentoListo> {
  const anio = Number(doc.xml.match(/<cbc:IssueDate>(\d{4})/)?.[1] ?? new Date().getFullYear());
  const base = nombreArchivo(PREFIJO[doc.tipo], nitEmisor, consecutivoArchivo, anio);
  const nombreXml = `${base}.xml`;
  const nombreZip = `${nombreArchivo('z', nitEmisor, consecutivoArchivo, anio)}.zip`;
  const xmlFirmado = firmarXades(doc.xml, cert);
  return { ...doc, xmlFirmado, nombreXml, nombreZip, zipBase64: await comprimir(nombreXml, xmlFirmado) };
}

export async function prepararFactura(input: FacturaInput, config: Configuracion, cert: Certificado, consecutivoArchivo: number) {
  return prepararDocumento(generarFactura(input, config), input.emisor.numeroDocumento, cert, consecutivoArchivo);
}

export async function prepararNota(
  tipo: 'nota-credito' | 'nota-debito',
  input: NotaInput,
  config: Configuracion,
  cert: Certificado,
  consecutivoArchivo: number,
) {
  return prepararDocumento(generarNota(tipo, input, config), input.emisor.numeroDocumento, cert, consecutivoArchivo);
}
