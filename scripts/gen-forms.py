#!/usr/bin/env python3
"""Regenerate src/react-app/forms/formsData.ts from PokeAPI.

Fetches every alternate form in the tracked families, resolves each one's 2D
default-sprite filename stem (the `slug` served through /sprites/form/:slug),
cleans up display names, and writes the typed dataset module.

Usage:  python3 scripts/gen-forms.py
Requires network access to pokeapi.co (sends a User-Agent; the default urllib
UA is 403'd). Run from the repo root.
"""
import concurrent.futures
import json
import os
import sys
import time
import urllib.request

UA = {"User-Agent": "PokeDexFlex/1.0 (dataset-gen)"}
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "react-app", "forms", "formsData.ts")
REGION = {"alola": "Alolan", "galar": "Galarian", "hisui": "Hisuian", "paldea": "Paldean"}


def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def prefix(*subs):
    return lambda n: any(n.startswith(p + "-") for p in subs)


# key, label, blurb, name-predicate
GROUPS = [
    ("regional", "Regional", "Region-specific variants from Alola, Galar, Hisui, and Paldea.",
     lambda n: any(k in n for k in ("-alola", "-galar", "-hisui", "-paldea")) and not n.startswith("pikachu")),
    ("vivillon", "Vivillon", "Twenty wing patterns determined by the trainer's real-world region.", prefix("vivillon")),
    ("alcremie", "Alcremie", "Every cream-and-sweet decoration combination.", prefix("alcremie")),
    ("unown", "Unown", "The full alphabet, plus ! and ?.", prefix("unown")),
    ("furfrou", "Furfrou", "Every groomed trim style.", prefix("furfrou")),
    ("flowers", "Flabébé Line", "Flabébé, Floette, and Florges in every flower color.", prefix("flabebe", "floette", "florges")),
    ("pikachu", "Pikachu Caps", "Ash's caps and cosplay outfits.", prefix("pikachu")),
    ("rotom", "Rotom", "Rotom's five appliance possessions.", prefix("rotom")),
    ("oricorio", "Oricorio", "The four nectar-fueled dance styles.", prefix("oricorio")),
    ("deoxys", "Deoxys", "Normal, Attack, Defense, and Speed formes.", prefix("deoxys")),
    ("mega", "Mega Evolutions", "Every Mega Evolution and Primal Reversion.", lambda n: "-mega" in n or "-primal" in n),
    ("gmax", "Gigantamax", "Gigantamax forms from the Galar region.", lambda n: n.endswith("-gmax")),
]


def fetch_slug(name):
    for attempt in range(4):
        try:
            d = get_json(f"https://pokeapi.co/api/v2/pokemon-form/{name}")
            fd = d["sprites"].get("front_default")
            if not fd:
                return None
            return name, fd.rsplit("/", 1)[-1][:-4]
        except Exception:
            time.sleep(0.5 * (attempt + 1))
    print("FAILED", name, file=sys.stderr)
    return None


def cap(s):
    return " ".join(w.capitalize() for w in s.replace("-", " ").split())


def species_title(tok):
    fix = {"mr": "Mr.", "farfetchd": "Farfetch'd", "flabebe": "Flabébé"}
    return " ".join(fix.get(w, w.capitalize()) for w in tok.split("-"))


def regional_display(name):
    for key, label in REGION.items():
        if f"-{key}" in name:
            base = name.split(f"-{key}")[0]
            rest = name.split(f"-{key}", 1)[1].strip("-")
            qual = ""
            if base.endswith("-totem"):
                base, qual = base[:-6], "Totem"
            rest = rest.replace("-breed", "").replace("standard", "").strip("-")
            extra = " ".join(x for x in [qual, cap(rest) if rest else ""] if x).strip()
            disp = f"{label} {species_title(base)}"
            return f"{disp} ({extra})" if extra else disp
    return species_title(name)


UNOWN = {"exclamation": "!", "question": "?"}


def clean(key, name):
    if key == "regional":
        return regional_display(name)
    if key == "flowers":
        sp, _, color = name.partition("-")
        return f"{species_title(sp)} {cap(color)}" if color else species_title(sp)
    if key == "mega":
        if name.endswith("-primal"):
            return f"{species_title(name[:-7])} (Primal)"
        base = name.replace("-mega", "")
        suffix = ""
        if base.endswith("-x"):
            base, suffix = base[:-2], " X"
        elif base.endswith("-y"):
            base, suffix = base[:-2], " Y"
        return f"Mega {species_title(base)}{suffix}"
    if key == "gmax":
        return species_title(name[:-5])
    suffix = name[len(key) + 1:] if name.startswith(key + "-") else name
    if key == "unown":
        return UNOWN.get(suffix, suffix.upper())
    if key == "alcremie":
        return cap(suffix.replace("-sweet", ""))
    if key == "oricorio":
        return {"pau": "Pa'u", "pom-pom": "Pom-Pom"}.get(suffix, cap(suffix))
    if key == "pikachu":
        return cap(suffix.replace("-cap", " Cap"))
    return cap(suffix) if suffix else species_title(name)


def main():
    print("Fetching form list...", file=sys.stderr)
    res = get_json("https://pokeapi.co/api/v2/pokemon-form?limit=100000")["results"]
    names = [r["name"] for r in res]

    groups_out = []
    for key, label, blurb, pred in GROUPS:
        members = [n for n in names if pred(n)]
        slugs = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            for r in ex.map(fetch_slug, members):
                if r:
                    slugs[r[0]] = r[1]
        seen, forms = set(), []
        for n in members:
            if n not in slugs or slugs[n] in seen:
                continue
            seen.add(slugs[n])
            forms.append({"slug": slugs[n], "name": clean(key, n)})
        if key == "regional":
            forms = [f for f in forms if "Cap" not in f["name"]]
        groups_out.append({"key": key, "label": label, "blurb": blurb, "forms": forms})
        print(f"{key:10} {len(forms):3} sprites", file=sys.stderr)

    total = sum(len(g["forms"]) for g in groups_out)
    header = (
        "// src/react-app/forms/formsData.ts\n//\n"
        "// Static reference dataset for the Forms gallery (browse-only). Each form's\n"
        "// `slug` is the PokeAPI 2D default-sprite filename stem, served + R2-cached\n"
        "// through the worker at /sprites/form/:slug. Generated from PokeAPI's\n"
        "// pokemon-form endpoint; regenerate with scripts/gen-forms if forms change.\n"
        "// Cosmetic families (Vivillon, Furfrou, Unown, Alcremie, Flabébé line) have no\n"
        "// HOME 3D render, so the whole gallery deliberately uses the 2D sprite set for\n"
        "// a consistent look.\n\n"
        "export type FormEntry = { slug: string; name: string };\n"
        "export type FormGroup = { key: string; label: string; blurb: string; forms: FormEntry[] };\n\n"
    )
    body = "export const FORM_GROUPS: FormGroup[] = " + json.dumps(groups_out, ensure_ascii=False, indent=2) + ";\n\n"
    body += "export const DEFAULT_FORM_GROUP = FORM_GROUPS[0].key;\n"
    body += f"export const TOTAL_FORMS = {total};\n"
    with open(OUT, "w") as f:
        f.write(header + body)
    print(f"WROTE {OUT} ({total} forms)", file=sys.stderr)


if __name__ == "__main__":
    main()
