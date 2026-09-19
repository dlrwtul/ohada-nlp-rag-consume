"""Détection de l'Acte Uniforme et du numéro d'article cités par un document récupéré.

Remplace l'ancienne regex `ARTICLE <n> <ABREVIATION>` (trop naïve : capte parfois
un mot de liaison comme "DE"/"DU" au lieu de l'acronyme) par une table de motifs
par Acte Uniforme, avec un score par comptage plutôt qu'un simple premier match.
"""
import re
import unicodedata
from collections import Counter


def _strip(s):
    s = unicodedata.normalize("NFD", str(s))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


ACTES = [
    ("AUPSRVE", "AU_recouvrement", "Acte Uniforme portant organisation des procedures simplifiees de recouvrement et des voies d'execution",
        [r"procedures?\s+simplifiees?\s+de\s+recouvrement", r"voies?\s+d.execution", r"\bAUPSRVE\b", r"\bAUVE\b"]),
    ("AUDSCGIE", "AU_societe", "Acte Uniforme relatif au droit des societes commerciales et du GIE",
        [r"societes?\s+commerciales?", r"groupement\s+d.interet\s+economique", r"\bAUDSCGIE\b", r"\bAUSCGIE\b", r"\bGIE\b"]),
    ("AUDCG", "AU_commercial", "Acte Uniforme relatif au droit commercial general",
        [r"droit\s+commercial\s+general", r"\bAUDCG\b", r"registre\s+du\s+commerce"]),
    ("AUS", "AU_surete", "Acte Uniforme portant organisation des suretes",
        [r"\bsuretes?\b", r"\bAUS\b"]),
    ("AUPCAP", "AU_procedures_collectives", "Acte Uniforme portant organisation des procedures collectives d'apurement du passif",
        [r"procedures?\s+collectives?", r"apurement\s+du\s+passif", r"redressement\s+judiciaire", r"liquidation\s+des\s+biens", r"\bAUPCAP\b"]),
    ("AUA", "AU_arbitrage", "Acte Uniforme relatif au droit de l'arbitrage",
        [r"\barbitrage\b", r"tribunal\s+arbitral", r"sentence\s+arbitrale", r"\bAUA\b"]),
    ("AUCTMR", "AU_transport", "Acte Uniforme relatif aux contrats de transport de marchandises par route",
        [r"transport\s+de\s+marchandises", r"\bAUCTMR\b"]),
    ("AUDCE", "AU_comptable", "Acte Uniforme relatif au droit comptable et a l'information financiere",
        [r"droit\s+comptable", r"\bSYSCOHADA\b", r"information\s+financiere"]),
    ("AUSCOOP", "AU_cooperative", "Acte Uniforme relatif au droit des societes cooperatives",
        [r"societes?\s+cooperatives?", r"\bAUSCOOP\b"]),
    ("AUM", "AU_mediation", "Acte Uniforme relatif a la mediation",
        [r"\bmediation\b", r"\bAUM\b"]),
]
ACRO2SLUG = {a[0]: a[1] for a in ACTES}
ACRO2NAME = {a[0]: a[2] for a in ACTES}


def detecter_acte(texte):
    t = _strip(texte)
    best, best_score = None, 0
    for acro, slug, nom, motifs in ACTES:
        score = sum(len(re.findall(m, t)) for m in motifs)
        if score > best_score:
            best, best_score = (acro, slug, nom), score
    return best if best else (None, None, None)


def detecter_article(texte):
    t = str(texte)
    arts = [int(m.group(1)) for m in re.finditer(r"[Aa]rticles?\s+(\d{1,4})", t)]
    if not arts:
        return None
    return str(Counter(arts).most_common(1)[0][0])


def extraire_reference(document):
    meta = document.metadata
    blob = f"{meta.get('content', '')} {meta.get('details', '')} {meta.get('title', '')}"
    acronyme, slug, _nom = detecter_acte(blob)
    article = detecter_article(blob)
    return acronyme, slug, article
