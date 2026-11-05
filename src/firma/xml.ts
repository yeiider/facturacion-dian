import { DOMParser, XMLSerializer, type Document, type Element } from '@xmldom/xmldom';
import { C14nCanonicalization, ExclusiveCanonicalization } from 'xml-crypto';
import { findAncestorNsForElement } from 'xml-crypto/lib/utils.js';

export type { Document, Element };

export function parsear(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

export function serializar(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

/** C14N inclusivo (REC-xml-c14n-20010315) de un elemento, con los namespaces heredados de sus ancestros. */
export function c14n(el: Element): string {
  const ancestorNamespaces = el.parentNode && el.parentNode.nodeType === 1 ? findAncestorNsForElement(el as never) : [];
  return new C14nCanonicalization().process(el as never, { ancestorNamespaces }) as string;
}

/** C14N exclusivo (xml-exc-c14n), usado en WS-Security. */
export function excC14n(el: Element, prefijosIncluidos: string[] = []): string {
  return new ExclusiveCanonicalization().process(el as never, {
    inclusiveNamespacesPrefixList: prefijosIncluidos,
  }) as string;
}

type Hijo = Element | string;

/** Crea un elemento con namespace, atributos e hijos (texto o elementos). */
export function crear(
  doc: Document,
  ns: string,
  nombre: string,
  attrs: Record<string, string> = {},
  hijos: Hijo[] = [],
): Element {
  const el = doc.createElementNS(ns, nombre);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('xmlns')) el.setAttributeNS('http://www.w3.org/2000/xmlns/', k, v);
    else if (k.includes(':')) el.setAttributeNS(NS_ATTR[k.split(':')[0]] ?? null, k, v);
    else el.setAttribute(k, v);
  }
  for (const h of hijos) el.appendChild(typeof h === 'string' ? doc.createTextNode(h) : h);
  return el;
}

const NS_ATTR: Record<string, string> = {
  wsu: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd',
};

export function hijosPorNombre(el: Element | Document, ns: string, local: string): Element[] {
  return Array.from(el.getElementsByTagNameNS(ns, local)) as Element[];
}
