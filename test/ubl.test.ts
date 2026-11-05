import { describe, expect, it } from 'vitest';
import { parsear } from '../src/firma/xml.js';
import { NS } from '../src/ubl/comun.js';
import { generarFactura, generarNota } from '../src/ubl/documento.js';
import { config, factura } from './fixtures.js';

const texto = (xml: string, ns: string, local: string, i = 0) =>
  parsear(xml).getElementsByTagNameNS(ns, local)[i]?.textContent;

describe('UBL 2.1', () => {
  it('genera una factura con CUFE, extensiones DIAN y totales', () => {
    const d = generarFactura(factura, config);
    expect(d.numero).toBe('SETP990000001');
    expect(texto(d.xml, NS.cbc, 'UUID')).toBe(d.cufe);
    expect(texto(d.xml, NS.cbc, 'ProfileExecutionID')).toBe('2');
    expect(texto(d.xml, NS.cbc, 'IssueTime')).toBe('10:20:30-05:00');
    expect(texto(d.xml, NS.cbc, 'PayableAmount')).toBe('514100.00');
    expect(texto(d.xml, NS.sts, 'QRCode')).toBe(
      `https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=${d.cufe}`,
    );
    expect(parsear(d.xml).getElementsByTagNameNS(NS.ext, 'UBLExtension')).toHaveLength(2);
    expect(parsear(d.xml).getElementsByTagNameNS(NS.cac, 'InvoiceLine')).toHaveLength(3);
    // Los caracteres especiales quedan escapados.
    expect(d.xml).toContain('Cliente &amp; Hijos');
  });

  it('rechaza un consecutivo fuera de la resolución', () => {
    expect(() => generarFactura({ ...factura, consecutivo: 1 }, config)).toThrow(/fuera del rango/);
  });

  it('genera nota crédito y nota débito con referencia a la factura', () => {
    const f = generarFactura(factura, config);
    const base = {
      ...factura,
      numero: 'NC1',
      facturaReferencia: { numero: f.numero, cufe: f.cufe, fecha: factura.fecha },
      concepto: '2',
      descripcionConcepto: 'Anulación de factura',
    };
    const nc = generarNota('nota-credito', base, config);
    expect(nc.xml).toContain('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"');
    expect(texto(nc.xml, NS.cbc, 'CreditNoteTypeCode')).toBe('91');
    expect(texto(nc.xml, NS.cbc, 'UUID', 0)).toBe(nc.cufe);
    expect(parsear(nc.xml).getElementsByTagNameNS(NS.sts, 'InvoiceControl')).toHaveLength(0);
    expect(parsear(nc.xml).getElementsByTagNameNS(NS.cac, 'CreditNoteLine')).toHaveLength(3);

    const nd = generarNota('nota-debito', { ...base, numero: 'ND1', concepto: '1' }, config);
    expect(texto(nd.xml, NS.cbc, 'CustomizationID')).toBe('30');
    expect(parsear(nd.xml).getElementsByTagNameNS(NS.cac, 'RequestedMonetaryTotal')).toHaveLength(1);
    expect(nd.cufe).not.toBe(nc.cufe);
  });
});
