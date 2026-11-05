import JSZip from 'jszip';

export type PrefijoArchivo = 'fv' | 'nc' | 'nd' | 'ad' | 'z';

/**
 * Nombre de archivo según el anexo técnico: prefijo + NIT (10 dígitos) + código del proveedor
 * tecnológico (000 en software propio) + año (2 dígitos) + consecutivo en hexadecimal (8 dígitos).
 * Ej: fv09003731150002600000001.xml
 */
export function nombreArchivo(
  prefijo: PrefijoArchivo,
  nit: string,
  consecutivo: number,
  anio: number,
  codigoProveedor = '000',
): string {
  const hex = consecutivo.toString(16).padStart(8, '0').slice(-8);
  return `${prefijo}${nit.padStart(10, '0')}${codigoProveedor}${String(anio % 100).padStart(2, '0')}${hex}`;
}

/** Comprime un XML en un ZIP y lo devuelve en base64, como lo esperan SendBillSync y SendTestSetAsync. */
export async function comprimir(nombreXml: string, xml: string): Promise<string> {
  const zip = new JSZip();
  zip.file(nombreXml, xml);
  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
}

/** Extrae los archivos de un ZIP en base64 (respuestas de GetStatusZip). */
export async function descomprimir(base64: string): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const salida: Record<string, string> = {};
  for (const [nombre, archivo] of Object.entries(zip.files)) {
    if (!archivo.dir) salida[nombre] = await archivo.async('string');
  }
  return salida;
}
