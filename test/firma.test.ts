import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, createPublicKey, createVerify } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignedXml } from 'xml-crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { cargarP12, type Certificado } from '../src/firma/certificado.js';
import { excC14n, parsear } from '../src/firma/xml.js';
import { firmarXades, horaColombia } from '../src/firma/xades.js';
import { sobreFirmado, NS_SOAP } from '../src/dian/soap.js';
import { generarFactura } from '../src/ubl/documento.js';
import { config, factura, p12DePrueba } from './fixtures.js';

let cert: Certificado;
beforeAll(() => {
  cert = cargarP12(p12DePrueba(), 'prueba');
});

const pem = () => `-----BEGIN CERTIFICATE-----\n${cert.certificadoBase64}\n-----END CERTIFICATE-----`;

/** Verifica con el SignedXml de xml-crypto (resuelve referencias y transforms por su cuenta). */
function verificar(xml: string): boolean {
  const doc = parsear(xml);
  const firma = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
  const sx = new SignedXml({ publicCert: pem() });
  sx.loadSignature(firma as never);
  try {
    return sx.checkSignature(xml);
  } catch {
    return false;
  }
}

const hayLxml = spawnSync('python3', ['-c', 'import lxml'], { stdio: 'ignore' }).status === 0;

describe('firma XAdES-EPES', () => {
  it('carga el .p12 con llave, certificado, emisor y serial', () => {
    expect(cert.serial).toBe(BigInt('0x0a1b2c3d').toString());
    expect(cert.emisor).toBe('C=CO,O=Pruebas,CN=EMPRESA DE PRUEBA SAS');
  });

  it('formatea la hora de firma en hora de Colombia', () => {
    expect(horaColombia(new Date('2026-11-05T15:20:31.123Z'))).toBe('2026-11-05T10:20:31.123-05:00');
  });

  it('produce una firma válida: tres referencias y RSA-SHA256', () => {
    const firmado = firmarXades(generarFactura(factura, config).xml, cert);
    expect(verificar(firmado)).toBe(true);
    expect(firmado).toContain('<xades:Identifier>https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf</xades:Identifier>');
    expect(firmado).toContain('<xades:ClaimedRole>supplier</xades:ClaimedRole>');
  });

  it.skipIf(!hayLxml)('la valida también libxml2 (lxml) + openssl, una implementación independiente', () => {
    const dir = mkdtempSync(join(tmpdir(), 'firma-'));
    const archivo = join(dir, 'f.xml');
    writeFileSync(archivo, firmarXades(generarFactura(factura, config).xml, cert));
    expect(() => execFileSync('python3', ['-I', 'scripts/verificar_firma.py', archivo])).not.toThrow();
  });

  it('detecta un documento alterado después de firmar', () => {
    const firmado = firmarXades(generarFactura(factura, config).xml, cert).replace(
      '<cbc:PayableAmount currencyID="COP">514100.00</cbc:PayableAmount>',
      '<cbc:PayableAmount currencyID="COP">1.00</cbc:PayableAmount>',
    );
    expect(verificar(firmado)).toBe(false);
  });

  it('no permite firmar dos veces', () => {
    const firmado = firmarXades(generarFactura(factura, config).xml, cert);
    expect(() => firmarXades(firmado, cert)).toThrow(/ya está firmado/);
  });
});

describe('WS-Security', () => {
  it('firma wsa:To con exc-c14n y RSA-SHA256', () => {
    const xml = sobreFirmado('https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc', 'GetStatus', { trackId: 'x' }, cert);
    const doc = parsear(xml);
    const to = doc.getElementsByTagNameNS(NS_SOAP.wsa, 'To')[0];
    const si = doc.getElementsByTagNameNS(NS_SOAP.ds, 'SignedInfo')[0];
    const digest = doc.getElementsByTagNameNS(NS_SOAP.ds, 'DigestValue')[0].textContent;
    expect(createHash('sha256').update(excC14n(to)).digest('base64')).toBe(digest);
    const firma = doc.getElementsByTagNameNS(NS_SOAP.ds, 'SignatureValue')[0].textContent!;
    const ok = createVerify('RSA-SHA256').update(excC14n(si)).verify(createPublicKey(pem()), firma, 'base64');
    expect(ok).toBe(true);
    expect(xml).toContain('<wcf:GetStatus><wcf:trackId>x</wcf:trackId></wcf:GetStatus>');
  });
});
