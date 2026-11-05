import type { Certificado } from '../firma/certificado.js';
import { parsear, type Element } from '../firma/xml.js';
import type { Ambiente } from '../types.js';
import { accion, sobreFirmado } from './soap.js';

export const URL_DIAN: Record<Ambiente, string> = {
  habilitacion: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
  produccion: 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
};

export interface RespuestaDian {
  valido: boolean;
  codigo: string;
  descripcion: string;
  mensaje: string;
  errores: string[];
  /** CUFE/CUDE con que la DIAN registró el documento. */
  cufe?: string;
  nombreArchivo?: string;
  /** ApplicationResponse de la DIAN en base64 (va dentro del AttachedDocument). */
  applicationResponse?: string;
}

export interface RangoNumeracion {
  resolucion: string;
  fechaResolucion: string;
  prefijo: string;
  desde: number;
  hasta: number;
  vigenteDesde: string;
  vigenteHasta: string;
  claveTecnica: string;
}

type Fetch = typeof fetch;

export class ErrorDian extends Error {
  constructor(
    message: string,
    readonly estadoHttp?: number,
    readonly cuerpo?: string,
  ) {
    super(message);
  }
}

const hijos = (el: Element) => Array.from(el.childNodes).filter((n) => n.nodeType === 1) as unknown as Element[];
const porNombre = (el: Element, local: string) =>
  Array.from(el.getElementsByTagNameNS('*', local)) as unknown as Element[];
const texto = (el: Element | undefined) => (el?.textContent ?? '').trim();
const hijo = (el: Element, local: string) => hijos(el).find((h) => h.localName === local);

function leerRespuesta(el: Element): RespuestaDian {
  const errores = hijo(el, 'ErrorMessage');
  return {
    valido: texto(hijo(el, 'IsValid')) === 'true',
    codigo: texto(hijo(el, 'StatusCode')),
    descripcion: texto(hijo(el, 'StatusDescription')),
    mensaje: texto(hijo(el, 'StatusMessage')),
    errores: errores ? hijos(errores).map((e) => texto(e)) : [],
    cufe: texto(hijo(el, 'XmlDocumentKey')) || undefined,
    nombreArchivo: texto(hijo(el, 'XmlFileName')) || undefined,
    applicationResponse: texto(hijo(el, 'XmlBase64Bytes')) || undefined,
  };
}

/**
 * Cliente de los web services de la DIAN (WcfDianCustomerServices).
 * Todas las llamadas van firmadas con el certificado del facturador.
 */
export class ClienteDian {
  readonly url: string;

  constructor(
    private readonly cert: Certificado,
    ambiente: Ambiente,
    private readonly opciones: { url?: string; fetch?: Fetch; timeoutMs?: number } = {},
  ) {
    this.url = opciones.url ?? URL_DIAN[ambiente];
  }

  private async llamar(operacion: string, parametros: Record<string, string>): Promise<Element> {
    const sobre = sobreFirmado(this.url, operacion, parametros, this.cert);
    const respuesta = await (this.opciones.fetch ?? fetch)(this.url, {
      method: 'POST',
      headers: { 'Content-Type': `application/soap+xml;charset=UTF-8;action="${accion(operacion)}"` },
      body: sobre,
      signal: AbortSignal.timeout(this.opciones.timeoutMs ?? 60_000),
    });
    const cuerpo = await respuesta.text();
    let doc;
    try {
      doc = parsear(cuerpo);
    } catch {
      throw new ErrorDian(`Respuesta no XML de la DIAN (HTTP ${respuesta.status})`, respuesta.status, cuerpo);
    }
    const fallo = porNombre(doc.documentElement as unknown as Element, 'Fault')[0];
    if (fallo) {
      const razon = texto(porNombre(fallo, 'Text')[0]) || texto(fallo);
      throw new ErrorDian(`SOAP Fault en ${operacion}: ${razon}`, respuesta.status, cuerpo);
    }
    const resultado = porNombre(doc.documentElement as unknown as Element, `${operacion}Result`)[0];
    if (!resultado) throw new ErrorDian(`Respuesta sin ${operacion}Result (HTTP ${respuesta.status})`, respuesta.status, cuerpo);
    return resultado;
  }

  /** Envía un documento (ZIP en base64) y espera la validación. Uso normal en producción. */
  async enviarDocumento(nombreZip: string, zipBase64: string): Promise<RespuestaDian> {
    const r = await this.llamar('SendBillSync', { fileName: nombreZip, contentFile: zipBase64 });
    return leerRespuesta(r);
  }

  /** Envía un documento del set de pruebas de habilitación. Devuelve el ZipKey para consultar con consultarZip. */
  async enviarSetPruebas(nombreZip: string, zipBase64: string, testSetId: string): Promise<{ zipKey: string; errores: string[] }> {
    const r = await this.llamar('SendTestSetAsync', { fileName: nombreZip, contentFile: zipBase64, testSetId });
    const lista = hijo(r, 'ErrorMessageList');
    return {
      zipKey: texto(hijo(r, 'ZipKey')),
      errores: lista ? porNombre(lista, 'ProcessedMessage').map((e) => texto(e)) : [],
    };
  }

  /** Estado de un envío asíncrono (ZipKey). */
  async consultarZip(zipKey: string): Promise<RespuestaDian[]> {
    const r = await this.llamar('GetStatusZip', { trackId: zipKey });
    return porNombre(r, 'DianResponse').map(leerRespuesta);
  }

  /** Estado de un documento por su CUFE/CUDE. */
  async consultarDocumento(cufe: string): Promise<RespuestaDian> {
    return leerRespuesta(await this.llamar('GetStatus', { trackId: cufe }));
  }

  /** Rangos de numeración asociados al software, incluida la clave técnica. */
  async rangosNumeracion(nitEmisor: string, nitProveedor: string, softwareId: string): Promise<RangoNumeracion[]> {
    const r = await this.llamar('GetNumberingRange', {
      accountCode: nitEmisor,
      accountCodeT: nitProveedor,
      softwareCode: softwareId,
    });
    const codigo = texto(porNombre(r, 'OperationCode')[0]);
    if (codigo && codigo !== '100') {
      throw new ErrorDian(`GetNumberingRange: ${texto(porNombre(r, 'OperationDescription')[0]) || codigo}`);
    }
    return porNombre(r, 'NumberRangeResponse').map((n) => ({
      resolucion: texto(hijo(n, 'ResolutionNumber')),
      fechaResolucion: texto(hijo(n, 'ResolutionDate')),
      prefijo: texto(hijo(n, 'Prefix')),
      desde: Number(texto(hijo(n, 'FromNumber'))),
      hasta: Number(texto(hijo(n, 'ToNumber'))),
      vigenteDesde: texto(hijo(n, 'ValidDateFrom')),
      vigenteHasta: texto(hijo(n, 'ValidDateTo')),
      claveTecnica: texto(hijo(n, 'TechnicalKey')),
    }));
  }
}
