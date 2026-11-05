import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces.js';
import { monto, NOMBRE_TRIBUTO, type ImpuestoCalculado, type Totales } from '../totales.js';
import type { MedioPago, Tercero } from '../types.js';

export const NS = {
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  sts: 'dian:gov:co:facturaelectronica:Structures-2-1',
  xades: 'http://uri.etsi.org/01903/v1.3.2#',
  xades141: 'http://uri.etsi.org/01903/v1.4.1#',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
} as const;

export const DIAN_AGENCIA = {
  schemeAgencyID: '195',
  schemeAgencyName: 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)',
} as const;

/** NIT de la DIAN como AuthorizationProvider. */
export const NIT_DIAN = '800197268';
export const DV_DIAN = '4';

type Attrs = Record<string, string>;

/** Agrega un elemento hoja con texto. */
export function hoja(padre: XMLBuilder, nombre: string, texto: string | number, attrs?: Attrs): XMLBuilder {
  padre.ele(nombre, attrs).txt(String(texto));
  return padre;
}

export function valor(padre: XMLBuilder, nombre: string, v: number, moneda: string): XMLBuilder {
  return hoja(padre, nombre, monto(v), { currencyID: moneda });
}

/** Atributos de identificación para NIT u otros documentos. */
export function attrsDocumento(t: { tipoDocumento: string; dv?: string }): Attrs {
  const a: Attrs = { ...DIAN_AGENCIA };
  if (t.tipoDocumento === '31') {
    if (!t.dv) throw new Error('El NIT requiere dígito de verificación (dv)');
    a.schemeID = t.dv;
  }
  a.schemeName = t.tipoDocumento;
  return a;
}

function direccion(padre: XMLBuilder, nombre: string, t: Tercero): void {
  const d = t.direccion;
  const dir = padre.ele(nombre);
  hoja(dir, 'cbc:ID', d.codigoMunicipio);
  hoja(dir, 'cbc:CityName', d.nombreMunicipio);
  if (d.codigoPostal) hoja(dir, 'cbc:PostalZone', d.codigoPostal);
  hoja(dir, 'cbc:CountrySubentity', d.nombreDepartamento);
  hoja(dir, 'cbc:CountrySubentityCode', d.codigoDepartamento);
  hoja(dir.ele('cac:AddressLine'), 'cbc:Line', d.direccion);
  const pais = dir.ele('cac:Country');
  hoja(pais, 'cbc:IdentificationCode', d.codigoPais ?? 'CO');
  hoja(pais, 'cbc:Name', d.nombrePais ?? 'Colombia', { languageID: 'es' });
}

/** AccountingSupplierParty / AccountingCustomerParty. */
export function parte(padre: XMLBuilder, nombre: string, t: Tercero, esEmisor: boolean): void {
  const p = padre.ele(nombre);
  hoja(p, 'cbc:AdditionalAccountID', t.tipoPersona);
  const party = p.ele('cac:Party');

  if (!esEmisor && t.tipoPersona === '2') {
    hoja(party.ele('cac:PartyIdentification'), 'cbc:ID', t.numeroDocumento, attrsDocumento(t));
  }
  hoja(party.ele('cac:PartyName'), 'cbc:Name', t.nombreComercial ?? t.razonSocial);
  direccion(party.ele('cac:PhysicalLocation'), 'cac:Address', t);

  const pts = party.ele('cac:PartyTaxScheme');
  hoja(pts, 'cbc:RegistrationName', t.razonSocial);
  hoja(pts, 'cbc:CompanyID', t.numeroDocumento, attrsDocumento(t));
  hoja(pts, 'cbc:TaxLevelCode', t.responsabilidades.join(';'), { listName: '48' });
  direccion(pts, 'cac:RegistrationAddress', t);
  const ts = pts.ele('cac:TaxScheme');
  hoja(ts, 'cbc:ID', t.tributo.id);
  hoja(ts, 'cbc:Name', t.tributo.nombre);

  const ple = party.ele('cac:PartyLegalEntity');
  hoja(ple, 'cbc:RegistrationName', t.razonSocial);
  hoja(ple, 'cbc:CompanyID', t.numeroDocumento, attrsDocumento(t));
  if (esEmisor && t.prefijoRegistro) {
    hoja(ple.ele('cac:CorporateRegistrationScheme'), 'cbc:ID', t.prefijoRegistro);
  }

  if (t.correo || t.telefono) {
    const c = party.ele('cac:Contact');
    if (t.telefono) hoja(c, 'cbc:Telephone', t.telefono);
    if (t.correo) hoja(c, 'cbc:ElectronicMail', t.correo);
  }
}

export function medioPago(padre: XMLBuilder, pago: MedioPago): void {
  const pm = padre.ele('cac:PaymentMeans');
  hoja(pm, 'cbc:ID', pago.forma);
  hoja(pm, 'cbc:PaymentMeansCode', pago.medio);
  if (pago.forma === '2') {
    if (!pago.fechaVencimiento) throw new Error('El pago a crédito requiere fechaVencimiento');
    hoja(pm, 'cbc:PaymentDueDate', pago.fechaVencimiento);
  }
}

function subtotal(padre: XMLBuilder, imp: ImpuestoCalculado, moneda: string): void {
  const st = padre.ele('cac:TaxSubtotal');
  valor(st, 'cbc:TaxableAmount', imp.base, moneda);
  valor(st, 'cbc:TaxAmount', imp.valor, moneda);
  const cat = st.ele('cac:TaxCategory');
  hoja(cat, 'cbc:Percent', imp.porcentaje.toFixed(2));
  const ts = cat.ele('cac:TaxScheme');
  hoja(ts, 'cbc:ID', imp.codigo);
  hoja(ts, 'cbc:Name', NOMBRE_TRIBUTO[imp.codigo]);
}

export function impuestosDocumento(padre: XMLBuilder, totales: Totales, moneda: string): void {
  for (const grupo of totales.impuestos) {
    const tt = padre.ele('cac:TaxTotal');
    valor(tt, 'cbc:TaxAmount', grupo.valor, moneda);
    for (const s of grupo.subtotales) subtotal(tt, s, moneda);
  }
}

export function totalMonetario(padre: XMLBuilder, nombre: string, totales: Totales, moneda: string): void {
  const lmt = padre.ele(nombre);
  valor(lmt, 'cbc:LineExtensionAmount', totales.valorBruto, moneda);
  valor(lmt, 'cbc:TaxExclusiveAmount', totales.baseGravable, moneda);
  valor(lmt, 'cbc:TaxInclusiveAmount', totales.valorConImpuestos, moneda);
  valor(lmt, 'cbc:PayableAmount', totales.totalPagar, moneda);
}

/** InvoiceLine / CreditNoteLine / DebitNoteLine. */
export function lineas(
  padre: XMLBuilder,
  nombreLinea: string,
  nombreCantidad: string,
  totales: Totales,
  moneda: string,
): void {
  totales.lineas.forEach((l, i) => {
    const unidad = l.linea.unidad ?? '94';
    const il = padre.ele(nombreLinea);
    hoja(il, 'cbc:ID', i + 1);
    hoja(il, nombreCantidad, l.linea.cantidad, { unitCode: unidad });
    valor(il, 'cbc:LineExtensionAmount', l.neto, moneda);
    if (l.descuento > 0) {
      const ac = il.ele('cac:AllowanceCharge');
      hoja(ac, 'cbc:ID', 1);
      hoja(ac, 'cbc:ChargeIndicator', 'false');
      hoja(ac, 'cbc:AllowanceChargeReason', 'Descuento');
      hoja(ac, 'cbc:MultiplierFactorNumeric', ((l.descuento / l.bruto) * 100).toFixed(2));
      valor(ac, 'cbc:Amount', l.descuento, moneda);
      valor(ac, 'cbc:BaseAmount', l.bruto, moneda);
    }
    for (const imp of l.impuestos) {
      const tt = il.ele('cac:TaxTotal');
      valor(tt, 'cbc:TaxAmount', imp.valor, moneda);
      subtotal(tt, imp, moneda);
    }
    const item = il.ele('cac:Item');
    hoja(item, 'cbc:Description', l.linea.descripcion);
    if (l.linea.codigo) {
      hoja(item.ele('cac:StandardItemIdentification'), 'cbc:ID', l.linea.codigo, {
        schemeID: '999',
        schemeName: 'Estándar de adopción del contribuyente',
      });
    }
    const precio = il.ele('cac:Price');
    valor(precio, 'cbc:PriceAmount', l.linea.precioUnitario, moneda);
    hoja(precio, 'cbc:BaseQuantity', 1, { unitCode: unidad });
  });
}
