import forge from 'node-forge';
import { createHash, createPrivateKey, type KeyObject } from 'node:crypto';

export interface Certificado {
  llavePrivada: KeyObject;
  /** Certificado del firmante en DER, base64. */
  certificadoBase64: string;
  /** Cadena completa (firmante primero), en DER base64. */
  cadenaBase64: string[];
  /** Nombre del emisor en formato RFC 4514 (ej. CN=...,O=...,C=CO). */
  emisor: string;
  /** Número de serie en decimal. */
  serial: string;
  vigenteHasta: Date;
}

function derBase64(cert: forge.pki.Certificate): string {
  return forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
}

function nombreRfc4514(attrs: forge.pki.CertificateField[]): string {
  return [...attrs]
    .reverse()
    .map((a) => `${a.shortName ?? a.type}=${String(a.value)}`)
    .join(',');
}

/** Carga un certificado de firma digital en formato PKCS#12 (.p12 / .pfx). */
export function cargarP12(contenido: Buffer, clave: string): Certificado {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(contenido.toString('binary')));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, clave);

  const bolsasLlave =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ??
    [];
  const llave = bolsasLlave[0]?.key;
  if (!llave) throw new Error('El .p12 no contiene llave privada');

  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c));
  if (certs.length === 0) throw new Error('El .p12 no contiene certificados');

  // El certificado del firmante es el que corresponde a la llave privada.
  const rsa = llave as forge.pki.rsa.PrivateKey;
  const firmante =
    certs.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n.equals(rsa.n)) ?? certs[0];
  const resto = certs.filter((c) => c !== firmante);

  return {
    llavePrivada: createPrivateKey(forge.pki.privateKeyToPem(llave)),
    certificadoBase64: derBase64(firmante),
    cadenaBase64: [derBase64(firmante), ...resto.map(derBase64)],
    emisor: nombreRfc4514(firmante.issuer.attributes),
    serial: BigInt(`0x${firmante.serialNumber}`).toString(10),
    vigenteHasta: firmante.validity.notAfter,
  };
}

/** Datos de un certificado para xades:SigningCertificate. */
export function datosCertificado(derBase64Cert: string): { digest: string; emisor: string; serial: string } {
  const der = Buffer.from(derBase64Cert, 'base64');
  const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(der.toString('binary'))));
  return {
    digest: createHash('sha256').update(der).digest('base64'),
    emisor: nombreRfc4514(cert.issuer.attributes),
    serial: BigInt(`0x${cert.serialNumber}`).toString(10),
  };
}
