import { createHash, createSign, randomUUID } from 'node:crypto';
import { NS } from '../ubl/comun.js';
import { datosCertificado, type Certificado } from './certificado.js';
import { c14n, crear, hijosPorNombre, parsear, serializar, type Document, type Element } from './xml.js';

const ALG = {
  c14n: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  rsaSha256: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  sha256: 'http://www.w3.org/2001/04/xmlenc#sha256',
  enveloped: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
  signedProps: 'http://uri.etsi.org/01903#SignedProperties',
} as const;

/** Política de firma v2 de la DIAN. */
export const POLITICA_DIAN = {
  url: 'https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf',
  descripcion: 'Política de firma para facturas electrónicas de la República de Colombia.',
  digest: 'dMoMvtcG5aIzgYo0tIsSQeVJBDnUnfSOfBpxXrmor0Y=',
} as const;

export interface OpcionesFirma {
  /** Fecha de firma. Por defecto, ahora. */
  fecha?: Date;
  /** Rol del firmante: supplier (emisor) o third party. */
  rol?: 'supplier' | 'third party';
  /** Id base para los elementos de la firma. Por defecto, un UUID. */
  id?: string;
}

const sha256 = (texto: string) => createHash('sha256').update(texto, 'utf8').digest('base64');

/** Hora de Colombia (UTC-5, sin horario de verano) con milisegundos: 2026-11-05T10:20:30.123-05:00. */
export function horaColombia(fecha: Date): string {
  return new Date(fecha.getTime() - 5 * 3600_000).toISOString().replace('Z', '-05:00');
}

/**
 * Firma un documento UBL con XAdES-EPES según la política de la DIAN.
 * La firma queda en el segundo ext:UBLExtension/ext:ExtensionContent.
 */
export function firmarXades(xml: string, cert: Certificado, opciones: OpcionesFirma = {}): string {
  const doc = parsear(xml);
  const raiz = doc.documentElement as unknown as Element;
  const contenedor = hijosPorNombre(doc, NS.ext, 'ExtensionContent')[1];
  if (!contenedor) throw new Error('El XML no tiene el segundo ext:UBLExtension para la firma');
  if (contenedor.childNodes.length > 0) throw new Error('El documento ya está firmado');

  // 1. Digest del documento antes de insertar la firma (equivale al transform enveloped-signature).
  const digestDocumento = sha256(c14n(raiz));

  const id = `xmldsig-${opciones.id ?? randomUUID()}`;
  const ds = (nombre: string, attrs?: Record<string, string>, hijos?: (Element | string)[]) =>
    crear(doc, NS.ds, `ds:${nombre}`, attrs, hijos);
  const xa = (nombre: string, attrs?: Record<string, string>, hijos?: (Element | string)[]) =>
    crear(doc, NS.xades, `xades:${nombre}`, attrs, hijos);
  const digestMethod = () => ds('DigestMethod', { Algorithm: ALG.sha256 });

  const referencia = (attrs: Record<string, string>, transforms: string[]) =>
    ds('Reference', attrs, [
      ...(transforms.length ? [ds('Transforms', {}, transforms.map((t) => ds('Transform', { Algorithm: t })))] : []),
      digestMethod(),
      ds('DigestValue', {}, ['']),
    ]);

  const refDocumento = referencia({ Id: `${id}-ref0`, URI: '' }, [ALG.enveloped]);
  const refKeyInfo = referencia({ URI: `#${id}-keyinfo` }, []);
  const refProps = referencia({ Type: ALG.signedProps, URI: `#${id}-signedprops` }, []);
  const signedInfo = ds('SignedInfo', {}, [
    ds('CanonicalizationMethod', { Algorithm: ALG.c14n }),
    ds('SignatureMethod', { Algorithm: ALG.rsaSha256 }),
    refDocumento,
    refKeyInfo,
    refProps,
  ]);
  const signatureValue = ds('SignatureValue', { Id: `${id}-sigvalue` }, ['']);
  const keyInfo = ds('KeyInfo', { Id: `${id}-keyinfo` }, [
    ds('X509Data', {}, [ds('X509Certificate', {}, [cert.certificadoBase64])]),
  ]);

  const certs = cert.cadenaBase64.map((c) => {
    const d = datosCertificado(c);
    return xa('Cert', {}, [
      xa('CertDigest', {}, [digestMethod(), ds('DigestValue', {}, [d.digest])]),
      xa('IssuerSerial', {}, [ds('X509IssuerName', {}, [d.emisor]), ds('X509SerialNumber', {}, [d.serial])]),
    ]);
  });

  const signedProps = xa('SignedProperties', { Id: `${id}-signedprops` }, [
    xa('SignedSignatureProperties', {}, [
      xa('SigningTime', {}, [horaColombia(opciones.fecha ?? new Date())]),
      xa('SigningCertificate', {}, certs),
      xa('SignaturePolicyIdentifier', {}, [
        xa('SignaturePolicyId', {}, [
          xa('SigPolicyId', {}, [
            xa('Identifier', {}, [POLITICA_DIAN.url]),
            xa('Description', {}, [POLITICA_DIAN.descripcion]),
          ]),
          xa('SigPolicyHash', {}, [digestMethod(), ds('DigestValue', {}, [POLITICA_DIAN.digest])]),
        ]),
      ]),
      xa('SignerRole', {}, [xa('ClaimedRoles', {}, [xa('ClaimedRole', {}, [opciones.rol ?? 'supplier'])])]),
    ]),
  ]);

  const firma = ds('Signature', { Id: id }, [
    signedInfo,
    signatureValue,
    keyInfo,
    ds('Object', {}, [xa('QualifyingProperties', { Target: `#${id}` }, [signedProps])]),
  ]);
  contenedor.appendChild(firma);

  // 2. Digests de KeyInfo y SignedProperties, canonicalizados en su contexto (heredan los namespaces de la raíz).
  ponerDigest(doc, refDocumento, digestDocumento);
  ponerDigest(doc, refKeyInfo, sha256(c14n(keyInfo)));
  ponerDigest(doc, refProps, sha256(c14n(signedProps)));

  // 3. Firma RSA-SHA256 de SignedInfo.
  const valor = createSign('RSA-SHA256').update(c14n(signedInfo), 'utf8').sign(cert.llavePrivada, 'base64');
  ponerTexto(doc, signatureValue, valor);

  return serializar(doc);
}

function ponerTexto(doc: Document, el: Element, valor: string): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(doc.createTextNode(valor));
}

function ponerDigest(doc: Document, referencia: Element, valor: string): void {
  ponerTexto(doc, hijosPorNombre(referencia, NS.ds, 'DigestValue')[0], valor);
}
