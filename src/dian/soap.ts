import { createHash, createSign, randomUUID } from 'node:crypto';
import type { Certificado } from '../firma/certificado.js';
import { excC14n, hijosPorNombre, parsear, serializar, type Element } from '../firma/xml.js';

export const NS_SOAP = {
  soap: 'http://www.w3.org/2003/05/soap-envelope',
  wcf: 'http://wcf.dian.colombia',
  wsa: 'http://www.w3.org/2005/08/addressing',
  wsse: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
  wsu: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
} as const;

const X509V3 = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3';
const BASE64 = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary';
const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';

export const accion = (operacion: string) => `http://wcf.dian.colombia/IWcfDianCustomerServices/${operacion}`;

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface OpcionesSobre {
  ahora?: Date;
  /** Vigencia del Timestamp en milisegundos. Por defecto 60 000. */
  vigenciaMs?: number;
}

/**
 * Arma el sobre SOAP 1.2 de una operación de WcfDianCustomerServices, firmado con WS-Security
 * (BinarySecurityToken X.509 + firma RSA-SHA256 sobre wsa:To), como lo exige la DIAN.
 */
export function sobreFirmado(
  url: string,
  operacion: string,
  parametros: Record<string, string>,
  cert: Certificado,
  opciones: OpcionesSobre = {},
): string {
  const id = randomUUID().replace(/-/g, '').toUpperCase();
  const creado = opciones.ahora ?? new Date();
  const expira = new Date(creado.getTime() + (opciones.vigenciaMs ?? 60_000));
  const cuerpo = Object.entries(parametros)
    .map(([k, v]) => `<wcf:${k}>${escapar(v)}</wcf:${k}>`)
    .join('');

  const xml =
    `<soap:Envelope xmlns:soap="${NS_SOAP.soap}" xmlns:wcf="${NS_SOAP.wcf}">` +
    `<soap:Header xmlns:wsa="${NS_SOAP.wsa}">` +
    `<wsse:Security xmlns:wsse="${NS_SOAP.wsse}" xmlns:wsu="${NS_SOAP.wsu}">` +
    `<wsu:Timestamp wsu:Id="TS-${id}"><wsu:Created>${creado.toISOString()}</wsu:Created><wsu:Expires>${expira.toISOString()}</wsu:Expires></wsu:Timestamp>` +
    `<wsse:BinarySecurityToken EncodingType="${BASE64}" ValueType="${X509V3}" wsu:Id="X509-${id}">${cert.certificadoBase64}</wsse:BinarySecurityToken>` +
    `<ds:Signature Id="SIG-${id}" xmlns:ds="${NS_SOAP.ds}">` +
    `<ds:SignedInfo><ds:CanonicalizationMethod Algorithm="${EXC_C14N}"/>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>` +
    `<ds:Reference URI="#id-${id}"><ds:Transforms><ds:Transform Algorithm="${EXC_C14N}"/></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue></ds:DigestValue></ds:Reference>` +
    `</ds:SignedInfo><ds:SignatureValue></ds:SignatureValue>` +
    `<ds:KeyInfo Id="KI-${id}"><wsse:SecurityTokenReference wsu:Id="STR-${id}"><wsse:Reference URI="#X509-${id}" ValueType="${X509V3}"/></wsse:SecurityTokenReference></ds:KeyInfo>` +
    `</ds:Signature></wsse:Security>` +
    `<wsa:Action>${accion(operacion)}</wsa:Action>` +
    `<wsa:To wsu:Id="id-${id}" xmlns:wsu="${NS_SOAP.wsu}">${escapar(url)}</wsa:To>` +
    `</soap:Header><soap:Body><wcf:${operacion}>${cuerpo}</wcf:${operacion}></soap:Body></soap:Envelope>`;

  const doc = parsear(xml);
  const to = hijosPorNombre(doc, NS_SOAP.wsa, 'To')[0];
  const signedInfo = hijosPorNombre(doc, NS_SOAP.ds, 'SignedInfo')[0];
  const digest = createHash('sha256').update(excC14n(to), 'utf8').digest('base64');
  poner(hijosPorNombre(signedInfo, NS_SOAP.ds, 'DigestValue')[0], digest);
  const firma = createSign('RSA-SHA256').update(excC14n(signedInfo), 'utf8').sign(cert.llavePrivada, 'base64');
  poner(hijosPorNombre(doc, NS_SOAP.ds, 'SignatureValue')[0], firma);
  return serializar(doc);
}

function poner(el: Element, texto: string): void {
  el.appendChild(el.ownerDocument!.createTextNode(texto));
}
