"""Verificación independiente (libxml2/lxml + openssl) de la firma XAdES de un XML DIAN.

Uso: python3 scripts/verificar_firma.py factura-firmada.xml
Sale con código 0 si los tres digests y la firma RSA son válidos.
"""
import tempfile, os
import sys, base64, hashlib, copy, subprocess
from lxml import etree
DS='http://www.w3.org/2000/09/xmldsig#'; XA='http://uri.etsi.org/01903/v1.3.2#'
tree=etree.parse(sys.argv[1]); root=tree.getroot()
sig=root.find('.//{%s}Signature'%DS)
def c14n(el): return etree.tostring(el, method='c14n', exclusive=False, with_comments=False)
def d(b): return base64.b64encode(hashlib.sha256(b).digest()).decode()
refs=sig.findall('{%s}SignedInfo/{%s}Reference'%(DS,DS))
# doc digest with enveloped transform
doc2=copy.deepcopy(root); s2=doc2.find('.//{%s}Signature'%DS); s2.getparent().remove(s2)
calc={'': d(c14n(doc2))}
ki=sig.find('{%s}KeyInfo'%DS); sp=sig.find('.//{%s}SignedProperties'%XA)
calc['#'+ki.get('Id')]=d(c14n(ki)); calc['#'+sp.get('Id')]=d(c14n(sp))
ok=True
for r in refs:
    uri=r.get('URI'); dv=r.find('{%s}DigestValue'%DS).text
    print(uri or '(doc)', dv==calc[uri]); ok &= dv==calc[uri]
tmp=tempfile.mkdtemp(); P=lambda n: os.path.join(tmp,n)
si=c14n(sig.find('{%s}SignedInfo'%DS)); open(P('si.bin'),'wb').write(si)
open(P('sig.bin'),'wb').write(base64.b64decode(sig.find('{%s}SignatureValue'%DS).text))
cert=ki.find('.//{%s}X509Certificate'%DS).text
open(P('cert.pem'),'w').write('-----BEGIN CERTIFICATE-----\n'+cert+'\n-----END CERTIFICATE-----\n')
subprocess.run(['openssl','x509','-in',P('cert.pem'),'-pubkey','-noout','-out',P('pub.pem')],check=True)
r=subprocess.run(['openssl','dgst','-sha256','-verify',P('pub.pem'),'-signature',P('sig.bin'),P('si.bin')],capture_output=True,text=True)
print('firma:',r.stdout.strip(), r.stderr.strip())
sys.exit(0 if ok and r.returncode==0 else 1)
