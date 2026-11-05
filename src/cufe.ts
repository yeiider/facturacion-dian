import { createHash } from 'node:crypto';
import { monto } from './totales.js';
import type { Ambiente, CodigoTributo } from './types.js';

export const sha384 = (texto: string): string => createHash('sha384').update(texto, 'utf8').digest('hex');

export const tipoAmbiente = (ambiente: Ambiente): '1' | '2' => (ambiente === 'produccion' ? '1' : '2');

export interface DatosCufe {
  /** Número del documento con prefijo. */
  numero: string;
  fecha: string;
  /** Hora con zona horaria, ej. 10:53:10-05:00. */
  hora: string;
  /** LineExtensionAmount. */
  valorBruto: number;
  porTributo: Record<CodigoTributo, number>;
  /** PayableAmount. */
  total: number;
  nitEmisor: string;
  documentoAdquiriente: string;
  ambiente: Ambiente;
}

function cadena(d: DatosCufe, clave: string): string {
  return (
    d.numero +
    d.fecha +
    d.hora +
    monto(d.valorBruto) +
    '01' +
    monto(d.porTributo['01']) +
    '04' +
    monto(d.porTributo['04']) +
    '03' +
    monto(d.porTributo['03']) +
    monto(d.total) +
    d.nitEmisor +
    d.documentoAdquiriente +
    clave +
    tipoAmbiente(d.ambiente)
  );
}

/** CUFE de la factura: SHA-384 de la cadena del anexo técnico con la clave técnica de la resolución. */
export function calcularCufe(datos: DatosCufe, claveTecnica: string): string {
  return sha384(cadena(datos, claveTecnica));
}

/** CUDE de notas crédito y débito: igual que el CUFE pero con el PIN del software. */
export function calcularCude(datos: DatosCufe, pinSoftware: string): string {
  return sha384(cadena(datos, pinSoftware));
}

/** SoftwareSecurityCode: SHA-384(SoftwareID + PIN + número del documento). */
export function codigoSeguridadSoftware(softwareId: string, pin: string, numero: string): string {
  return sha384(softwareId + pin + numero);
}

/** URL de consulta pública que va en el QR y en sts:QRCode. */
export function urlQr(cufe: string, ambiente: Ambiente): string {
  const host = ambiente === 'produccion' ? 'catalogo-vpfe.dian.gov.co' : 'catalogo-vpfe-hab.dian.gov.co';
  return `https://${host}/document/searchqr?documentkey=${cufe}`;
}
