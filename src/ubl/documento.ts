import { create } from 'xmlbuilder2';
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces.js';
import { calcularCude, calcularCufe, codigoSeguridadSoftware, tipoAmbiente, urlQr } from '../cufe.js';
import { calcularTotales, type Totales } from '../totales.js';
import type { Configuracion, FacturaInput, NotaInput } from '../types.js';
import {
  DIAN_AGENCIA,
  DV_DIAN,
  hoja,
  impuestosDocumento,
  lineas,
  medioPago,
  NIT_DIAN,
  NS,
  parte,
  totalMonetario,
} from './comun.js';

export type TipoDocumento = 'factura' | 'nota-credito' | 'nota-debito';

export interface DocumentoGenerado {
  tipo: TipoDocumento;
  numero: string;
  /** CUFE (factura) o CUDE (notas). */
  cufe: string;
  qr: string;
  totales: Totales;
  /** XML UBL 2.1 sin firmar. El segundo UBLExtension queda vacío para la firma. */
  xml: string;
}

const RAIZ: Record<TipoDocumento, { nombre: string; ns: string; esquema: string }> = {
  factura: {
    nombre: 'Invoice',
    ns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    esquema: 'http://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-Invoice-2.1.xsd',
  },
  'nota-credito': {
    nombre: 'CreditNote',
    ns: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
    esquema: 'http://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-CreditNote-2.1.xsd',
  },
  'nota-debito': {
    nombre: 'DebitNote',
    ns: 'urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2',
    esquema: 'http://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-DebitNote-2.1.xsd',
  },
};

const PERFIL: Record<TipoDocumento, string> = {
  factura: 'DIAN 2.1: Factura Electrónica de Venta',
  'nota-credito': 'DIAN 2.1: Nota Crédito de Factura Electrónica de Venta',
  'nota-debito': 'DIAN 2.1: Nota Débito de Factura Electrónica de Venta',
};

const atributosAgencia = (schemeID?: string, schemeName?: string) => ({
  ...DIAN_AGENCIA,
  ...(schemeID ? { schemeID } : {}),
  ...(schemeName ? { schemeName } : {}),
});

function raiz(tipo: TipoDocumento): XMLBuilder {
  const r = RAIZ[tipo];
  return create({ version: '1.0', encoding: 'UTF-8', standalone: false }).ele(r.ns, r.nombre, {
    'xmlns:cac': NS.cac,
    'xmlns:cbc': NS.cbc,
    'xmlns:ds': NS.ds,
    'xmlns:ext': NS.ext,
    'xmlns:sts': NS.sts,
    'xmlns:xades': NS.xades,
    'xmlns:xades141': NS.xades141,
    'xmlns:xsi': NS.xsi,
    'xsi:schemaLocation': `${r.ns}     ${r.esquema}`,
  });
}

interface DatosExtension {
  config: Configuracion;
  numero: string;
  qr: string;
  factura?: FacturaInput;
}

function extensiones(doc: XMLBuilder, d: DatosExtension): void {
  const exts = doc.ele('ext:UBLExtensions');
  const dian = exts.ele('ext:UBLExtension').ele('ext:ExtensionContent').ele('sts:DianExtensions');

  if (d.factura) {
    const r = d.factura.resolucion;
    const ic = dian.ele('sts:InvoiceControl');
    hoja(ic, 'sts:InvoiceAuthorization', r.numero);
    const periodo = ic.ele('sts:AuthorizationPeriod');
    hoja(periodo, 'cbc:StartDate', r.fechaInicio);
    hoja(periodo, 'cbc:EndDate', r.fechaFin);
    const ai = ic.ele('sts:AuthorizedInvoices');
    if (r.prefijo) hoja(ai, 'sts:Prefix', r.prefijo);
    hoja(ai, 'sts:From', r.desde);
    hoja(ai, 'sts:To', r.hasta);
  }

  hoja(dian.ele('sts:InvoiceSource'), 'cbc:IdentificationCode', 'CO', {
    listAgencyID: '6',
    listAgencyName: 'United Nations Economic Commission for Europe',
    listSchemeURI: 'urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1',
  });

  const s = d.config.software;
  const sp = dian.ele('sts:SoftwareProvider');
  hoja(sp, 'sts:ProviderID', s.nitProveedor, atributosAgencia(s.dvProveedor, '31'));
  hoja(sp, 'sts:SoftwareID', s.id, atributosAgencia());
  hoja(dian, 'sts:SoftwareSecurityCode', codigoSeguridadSoftware(s.id, s.pin, d.numero), atributosAgencia());
  hoja(dian.ele('sts:AuthorizationProvider'), 'sts:AuthorizationProviderID', NIT_DIAN, atributosAgencia(DV_DIAN, '31'));
  hoja(dian, 'sts:QRCode', d.qr);

  // Segundo UBLExtension: aquí se inserta la firma XAdES.
  exts.ele('ext:UBLExtension').ele('ext:ExtensionContent');
}

function validarFechaHora(fecha: string, hora: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`Fecha inválida: ${fecha} (use AAAA-MM-DD)`);
  if (!/^\d{2}:\d{2}:\d{2}$/.test(hora)) throw new Error(`Hora inválida: ${hora} (use HH:MM:SS)`);
}

/** Genera una factura electrónica de venta (UBL Invoice) sin firmar. */
export function generarFactura(input: FacturaInput, config: Configuracion): DocumentoGenerado {
  validarFechaHora(input.fecha, input.hora);
  const r = input.resolucion;
  if (input.consecutivo < r.desde || input.consecutivo > r.hasta) {
    throw new Error(`El consecutivo ${input.consecutivo} está fuera del rango autorizado ${r.desde}-${r.hasta}`);
  }
  const numero = `${r.prefijo}${input.consecutivo}`;
  const hora = `${input.hora}-05:00`;
  const moneda = input.moneda ?? 'COP';
  const totales = calcularTotales(input.lineas);
  const cufe = calcularCufe(
    {
      numero,
      fecha: input.fecha,
      hora,
      valorBruto: totales.valorBruto,
      porTributo: totales.porTributo,
      total: totales.totalPagar,
      nitEmisor: input.emisor.numeroDocumento,
      documentoAdquiriente: input.adquiriente.numeroDocumento,
      ambiente: config.ambiente,
    },
    r.claveTecnica,
  );
  const qr = urlQr(cufe, config.ambiente);

  const doc = raiz('factura');
  extensiones(doc, { config, numero, qr, factura: input });
  encabezado(doc, 'factura', input.tipoOperacion ?? '10', numero, cufe, 'CUFE-SHA384', config);
  hoja(doc, 'cbc:IssueDate', input.fecha);
  hoja(doc, 'cbc:IssueTime', hora);
  if (input.pago.fechaVencimiento) hoja(doc, 'cbc:DueDate', input.pago.fechaVencimiento);
  hoja(doc, 'cbc:InvoiceTypeCode', input.tipoFactura ?? '01');
  for (const n of input.notas ?? []) hoja(doc, 'cbc:Note', n);
  hoja(doc, 'cbc:DocumentCurrencyCode', moneda);
  hoja(doc, 'cbc:LineCountNumeric', totales.lineas.length);
  cuerpo(doc, input, totales, moneda, 'cac:LegalMonetaryTotal', 'cac:InvoiceLine', 'cbc:InvoicedQuantity');

  return { tipo: 'factura', numero, cufe, qr, totales, xml: doc.end({ prettyPrint: false }) };
}

/** Genera una nota crédito o débito que referencia una factura. */
export function generarNota(
  tipo: 'nota-credito' | 'nota-debito',
  input: NotaInput,
  config: Configuracion,
): DocumentoGenerado {
  validarFechaHora(input.fecha, input.hora);
  const hora = `${input.hora}-05:00`;
  const moneda = input.moneda ?? 'COP';
  const totales = calcularTotales(input.lineas);
  const cude = calcularCude(
    {
      numero: input.numero,
      fecha: input.fecha,
      hora,
      valorBruto: totales.valorBruto,
      porTributo: totales.porTributo,
      total: totales.totalPagar,
      nitEmisor: input.emisor.numeroDocumento,
      documentoAdquiriente: input.adquiriente.numeroDocumento,
      ambiente: config.ambiente,
    },
    config.software.pin,
  );
  const qr = urlQr(cude, config.ambiente);
  const credito = tipo === 'nota-credito';

  const doc = raiz(tipo);
  extensiones(doc, { config, numero: input.numero, qr });
  // 20 = nota crédito que referencia factura, 30 = nota débito que referencia factura.
  encabezado(doc, tipo, credito ? '20' : '30', input.numero, cude, 'CUDE-SHA384', config);
  hoja(doc, 'cbc:IssueDate', input.fecha);
  hoja(doc, 'cbc:IssueTime', hora);
  if (credito) hoja(doc, 'cbc:CreditNoteTypeCode', '91');
  for (const n of input.notas ?? []) hoja(doc, 'cbc:Note', n);
  hoja(doc, 'cbc:DocumentCurrencyCode', moneda);
  hoja(doc, 'cbc:LineCountNumeric', totales.lineas.length);

  const dr = doc.ele('cac:DiscrepancyResponse');
  hoja(dr, 'cbc:ReferenceID', input.facturaReferencia.numero);
  hoja(dr, 'cbc:ResponseCode', input.concepto);
  hoja(dr, 'cbc:Description', input.descripcionConcepto);
  const ref = doc.ele('cac:BillingReference').ele('cac:InvoiceDocumentReference');
  hoja(ref, 'cbc:ID', input.facturaReferencia.numero);
  hoja(ref, 'cbc:UUID', input.facturaReferencia.cufe, { schemeName: 'CUFE-SHA384' });
  hoja(ref, 'cbc:IssueDate', input.facturaReferencia.fecha);

  cuerpo(
    doc,
    input,
    totales,
    moneda,
    credito ? 'cac:LegalMonetaryTotal' : 'cac:RequestedMonetaryTotal',
    credito ? 'cac:CreditNoteLine' : 'cac:DebitNoteLine',
    credito ? 'cbc:CreditedQuantity' : 'cbc:DebitedQuantity',
  );

  return { tipo, numero: input.numero, cufe: cude, qr, totales, xml: doc.end({ prettyPrint: false }) };
}

function encabezado(
  doc: XMLBuilder,
  tipo: TipoDocumento,
  customization: string,
  numero: string,
  clave: string,
  esquemaClave: string,
  config: Configuracion,
): void {
  hoja(doc, 'cbc:UBLVersionID', 'UBL 2.1');
  hoja(doc, 'cbc:CustomizationID', customization);
  hoja(doc, 'cbc:ProfileID', PERFIL[tipo]);
  hoja(doc, 'cbc:ProfileExecutionID', tipoAmbiente(config.ambiente));
  hoja(doc, 'cbc:ID', numero);
  hoja(doc, 'cbc:UUID', clave, { schemeID: tipoAmbiente(config.ambiente), schemeName: esquemaClave });
}

function cuerpo(
  doc: XMLBuilder,
  input: FacturaInput | NotaInput,
  totales: Totales,
  moneda: string,
  nombreTotal: string,
  nombreLinea: string,
  nombreCantidad: string,
): void {
  parte(doc, 'cac:AccountingSupplierParty', input.emisor, true);
  parte(doc, 'cac:AccountingCustomerParty', input.adquiriente, false);
  medioPago(doc, input.pago);
  impuestosDocumento(doc, totales, moneda);
  totalMonetario(doc, nombreTotal, totales, moneda);
  lineas(doc, nombreLinea, nombreCantidad, totales, moneda);
}
