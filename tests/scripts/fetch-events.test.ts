import { describe, it, expect } from "vitest";
import {
  buildSpeciesResolver,
  cleanWikitext,
  extractTopLevelTemplates,
  extractRecruitedSpeciesFromReward,
  deriveMysteryDungeonGames,
  deriveWonderMailMethod,
  parsePage,
  parseTemplateArgs,
  splitTopLevel,
  splitTopLevelOn,
  stripWikitableCellAttrs,
  toPokeApiSlug,
  baseSpeciesNameForLookup,
  deriveRegionFromTitle,
  extractYear,
  gameLabel,
  makeUniqueSlug,
} from "../../scripts/fetch-events";

const SNAPSHOT = {
  species: [
    { id: 151, name: "mew" },
    { id: 890, name: "eternatus" },
    { id: 25, name: "pikachu" },
  ],
};

describe("splitTopLevel / extractTopLevelTemplates", () => {
  it("splits on top-level pipes only, treating [[..]] and {{..}} as opaque", () => {
    expect(splitTopLevel("a|b|c")).toEqual(["a", "b", "c"]);
    expect(splitTopLevel("a|{{tt|x|y}}|c")).toEqual(["a", "{{tt|x|y}}", "c"]);
    expect(splitTopLevel("a|[[x|y]]|c")).toEqual(["a", "[[x|y]]", "c"]);
  });

  it("extracts only top-level template invocations, keeping nested ones inside args", () => {
    const text = "prefix {{Outer|a=1|b={{Inner|c=2}}}} suffix";
    const tmpls = extractTopLevelTemplates(text);
    expect(tmpls).toHaveLength(1);
    expect(tmpls[0].name).toBe("Outer");
    expect(tmpls[0].args).toContain("{{Inner|c=2}}");
  });
});

describe("parseTemplateArgs", () => {
  it("splits named params (key=value) from positional params", () => {
    const { kv, positional } = parseTemplateArgs("swsh|Serial Code|hide|September 16 to November 17, 2022");
    expect(positional).toEqual(["swsh", "Serial Code", "hide", "September 16 to November 17, 2022"]);
    expect(kv).toEqual({});
  });

  it("parses key=value params, lowercasing keys", () => {
    const { kv } = parseTemplateArgs("Pokemon=Mew|Level=5|ot=GF|id=22796");
    expect(kv).toEqual({ pokemon: "Mew", level: "5", ot: "GF", id: "22796" });
  });
});

describe("cleanWikitext", () => {
  it("resolves piped and bare wiki links", () => {
    expect(cleanWikitext("[[Pokémon Sword and Shield|Sword and Shield]]")).toBe("Sword and Shield");
    expect(cleanWikitext("[[Mew]]")).toBe("Mew");
  });

  it("unwraps common inline templates to their display text", () => {
    expect(cleanWikitext("{{p|Mew}}")).toBe("Mew");
    expect(cleanWikitext("{{DL|Distribution device|special machine}}")).toBe("special machine");
  });

  it("returns null for empty/whitespace-only input", () => {
    expect(cleanWikitext("")).toBeNull();
    expect(cleanWikitext("   ")).toBeNull();
    expect(cleanWikitext(undefined)).toBeNull();
  });
});

describe("toPokeApiSlug / baseSpeciesNameForLookup", () => {
  it("matches PokeAPI's naming convention for known tricky species", () => {
    expect(toPokeApiSlug("Mr. Mime")).toBe("mr-mime");
    expect(toPokeApiSlug("Nidoran♀")).toBe("nidoran-f");
    expect(toPokeApiSlug("Farfetch'd")).toBe("farfetchd");
    expect(toPokeApiSlug("Type: Null")).toBe("type-null");
    expect(toPokeApiSlug("Flabébé")).toBe("flabebe");
  });

  it("strips regional/form qualifiers down to the base species name", () => {
    expect(baseSpeciesNameForLookup("Alolan Raichu")).toBe("Raichu");
    expect(baseSpeciesNameForLookup("Deoxys (Attack Forme)")).toBe("Deoxys");
  });
});

describe("deriveRegionFromTitle / gameLabel / extractYear", () => {
  it("derives a region from known page-title keywords", () => {
    expect(deriveRegionFromTitle("List of Japanese event Pokémon distributions in Generation I")).toBe("Japan");
    expect(deriveRegionFromTitle("List of event Pokémon distributions in Pokémon Sword and Shield")).toBeNull();
  });

  it("maps known game codes to display labels, passing through unknown codes", () => {
    expect(gameLabel("swsh")).toBe("Sword/Shield");
    expect(gameLabel("4d")).toBe("Diamond");
    expect(gameLabel("mystery-game")).toBe("mystery-game");
  });

  it("extracts the first 4-digit year found in free text", () => {
    expect(extractYear("September 16 to November 17, 2022")).toBe(2022);
    expect(extractYear("no year here")).toBeNull();
    expect(extractYear(null)).toBeNull();
  });
});

describe("splitTopLevelOn / stripWikitableCellAttrs", () => {
  it("splits on a literal multi-char separator, treating [[..]] and {{..}} as opaque", () => {
    expect(splitTopLevelOn("a||b||c", "||")).toEqual(["a", "b", "c"]);
    expect(splitTopLevelOn("{{tt|x||y}}||c", "||")).toEqual(["{{tt|x||y}}", "c"]);
  });

  it("strips a leading `attr=... | content` prefix but leaves plain content alone", () => {
    expect(stripWikitableCellAttrs('style="text-align:center" | {{p|Mew}}')).toBe("{{p|Mew}}");
    expect(stripWikitableCellAttrs("{{p|Pikachu}}")).toBe("{{p|Pikachu}}");
    expect(stripWikitableCellAttrs("Tokyo")).toBe("Tokyo");
  });
});

describe("extractRecruitedSpeciesFromReward / Mystery Dungeon title derivation", () => {
  it("matches a recruit-Pokémon reward cell but not an item/TM reward cell", () => {
    expect(extractRecruitedSpeciesFromReward("{{p|Venonat}}♂ joins")).toBe("Venonat");
    expect(extractRecruitedSpeciesFromReward("{{p|Metagross}} joins")).toBe("Metagross");
    expect(extractRecruitedSpeciesFromReward("250 [[Poké]] + [[Insomniscope]]")).toBeNull();
    expect(extractRecruitedSpeciesFromReward("{{m|Poison Jab}} TM")).toBeNull();
  });

  it("derives the Mystery Dungeon game and Wonder Mail variant from a page title", () => {
    expect(deriveMysteryDungeonGames("List of Japanese Wonder Mail S distributions in Pokémon Mystery Dungeon: Explorers of Sky")).toBe(
      "Mystery Dungeon: Explorers of Sky",
    );
    expect(
      deriveWonderMailMethod("List of Japanese Wonder Mail S distributions in Pokémon Mystery Dungeon: Explorers of Sky"),
    ).toBe("Wonder Mail S");
    expect(
      deriveWonderMailMethod("List of Wonder Mail distributions in Pokémon Mystery Dungeon: Explorers of Time and Explorers of Darkness"),
    ).toBe("Wonder Mail");
  });
});

describe("makeUniqueSlug", () => {
  it("de-dupes with a numeric suffix on collision", () => {
    const used = new Set<string>();
    expect(makeUniqueSlug(["Mew", "20th Anniversary"], used)).toBe("mew-20th-anniversary");
    expect(makeUniqueSlug(["Mew", "20th Anniversary"], used)).toBe("mew-20th-anniversary-2");
  });
});

describe("parsePage: template parser (Gen VIII+ head/entry style)", () => {
  const wikitext = `
This is a reverse-chronological '''list of event Pokémon distributions'''.

===Shiny Eternatus Gift===
{{SwShevent/head|wcid=1643|wctitle=Shiny Eternatus Gift|lochide=yes
|ball=Cherish
|shiny=yes
|pokemon=Eternatus
|level=100
|ndex=0890
|type=Poison
|type2=Dragon
|ot={{tt|Galar|English}}
|id=221118
|ability=Pressure
|nature=Timid
|fateful=yes
|ribbon=Classic
|met=a lovely place
}}
{{G8event/entry|swsh|Serial Code (A codes)|hide|September 16 to November 17, 2022}}
{{G8event/entrybottom|swsh|Serial Code (E and U codes)|hide|September 18, 2022 to January 1, 2023}}
{{G8event/footer}}

{| style="background: #fff"
! Country
! Location
! Distribution Dates
|-
| Australia
| EB Games stores
| September 2022
|-
| United Kingdom
| GAME stores
| September 2022
|}
`;

  it("extracts one EventRow per head block, resolving species by ndex", () => {
    const resolver = buildSpeciesResolver(SNAPSHOT);
    const { rows, stats } = parsePage(wikitext, "List of event Pokémon distributions in Pokémon Sword and Shield", resolver, new Set());

    expect(stats.usedFallback).toBe(false);
    expect(rows).toHaveLength(1);
    const row = rows[0];

    expect(row.speciesId).toBe(890);
    expect(row.formId).toBeNull();
    expect(row.isShiny).toBe(1);
    expect(row.otName).toBe("Galar"); // {{tt|Galar|English}} unwraps to its first positional param
    expect(row.otId).toBe("221118");
    expect(row.ribbon).toBe("Classic");
    expect(row.year).toBe(2022);
    expect(row.games).toBe("Sword/Shield");
    expect(row.method).toContain("Serial Code");
    expect(row.sourcePage).toBe("List of event Pokémon distributions in Pokémon Sword and Shield");
    expect(row.region).toBeNull(); // page title has no region keyword
    expect(row.notes).toContain("Distributed via 2 methods");
    expect(row.notes).toContain("Distributed at");
    expect(row.slug).toMatch(/^eternatus/);
  });

  it("null-fills fields the source doesn't state", () => {
    const minimalWikitext = `{{G1event|pokemon=Mew|ndex=151}}`;
    const resolver = buildSpeciesResolver(SNAPSHOT);
    const { rows } = parsePage(minimalWikitext, "List of Japanese event Pokémon distributions in Generation I", resolver, new Set());

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.speciesId).toBe(151);
    expect(row.otName).toBeNull();
    expect(row.otId).toBeNull();
    expect(row.ribbon).toBeNull();
    expect(row.games).toBeNull();
    expect(row.method).toBeNull();
    expect(row.year).toBeNull();
    expect(row.isShiny).toBe(0);
    expect(row.region).toBe("Japan");
  });

  it("skips (and does not fabricate) a block whose species cannot be resolved", () => {
    const wikitext = `{{G1event|pokemon=TotallyMadeUpPokemon|ndex=9999}}`;
    const resolver = buildSpeciesResolver(SNAPSHOT);
    const { rows, stats } = parsePage(wikitext, "List of event Pokémon distributions", resolver, new Set());
    expect(rows).toHaveLength(0);
    expect(stats.skippedUnresolved).toBe(1);
  });
});

describe("parsePage: wikitable fallback", () => {
  const wikitext = `
This page has no event templates, only a plain wikitable.

{| class="wikitable"
! Pokémon
! Location
! Date
|-
| {{p|Pikachu}}
| Tokyo
| 2001
|-
| {{p|Mew}}
| Osaka
| 2002
|}
`;

  it("extracts one row per data row when no templates are present", () => {
    const resolver = buildSpeciesResolver(SNAPSHOT);
    const { rows, stats } = parsePage(wikitext, "List of Japanese event Pokémon distributions in Generation II", resolver, new Set());

    expect(stats.usedFallback).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.speciesId).sort((a, b) => a - b)).toEqual([25, 151]);
    expect(rows[0].region).toBe("Japan");
    expect(rows[0].method).toBeNull();
    expect(rows[0].games).toBeNull();
  });
});

describe("parsePage: wikitable fallback with structured columns", () => {
  const wikitext = `
{| class="wikitable"
! Pokémon
! Ndex
! Level
! OT
! ID
! Ribbon
! Games
! Method
! Date
! Region
! Notes
|-
| style="text-align:center" | {{p|Mew}}
| 151
| 5
| GF
| 22796
| Classic
| Yellow
| Serial Code
| March 2016
| Japan
| Distributed at select stores
|}
`;

  it("pulls level/OT/ID/ribbon/games/method/date/region into their own fields instead of dumping everything into notes", () => {
    const resolver = buildSpeciesResolver(SNAPSHOT);
    const { rows, stats } = parsePage(wikitext, "List of some event Pokémon distributions", resolver, new Set());

    expect(stats.usedFallback).toBe(true);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.speciesId).toBe(151);
    expect(row.otName).toBe("GF");
    expect(row.otId).toBe("22796");
    expect(row.ribbon).toBe("Classic");
    expect(row.games).toBe("Yellow");
    expect(row.method).toBe("Serial Code");
    expect(row.year).toBe(2016);
    expect(row.region).toBe("Japan");
    expect(row.notes).toContain("Distributed at select stores");
    // recognized columns shouldn't leak into the notes fallback text
    expect(row.notes).not.toContain("Serial Code");
    expect(row.notes).not.toContain("Classic");
  });
});

describe("parsePage: Mystery Dungeon Wonder Mail reward-join wikitable", () => {
  const wikitext = `
This is a reverse-chronological list of Wonder Mail distributed for the game.

===April 2009===
{| class="roundy"
! Password
! Client
! Objective
! Place
! Difficulty
! Reward
|-
| style="text-align:center" | <code>ABCDE</code>
| style="text-align:center" | [[File:Client.png]]<br>{{pcolor|Absol|000}}
| Find [[Rawst Berry]].
| [[Waterfall Cave]] B8F
| style="text-align:center" | B
| 250 [[Poké]] + [[Insomniscope]]
|-
| style="text-align:center" | <code>FGHIJ</code>
| style="text-align:center" | [[File:Client2.png]]<br>{{pcolor|Magnezone|000}}
| Rescue {{p|Pikachu}}.
| [[Foggy Forest]] 10F
| style="text-align:center" | A
| {{p|Pikachu}}♂ joins
|}
`;

  it("extracts a recruit-Pokémon row from the Reward column, skipping item/TM reward rows", () => {
    const resolver = buildSpeciesResolver(SNAPSHOT);
    const { rows, stats } = parsePage(
      wikitext,
      "List of Japanese Wonder Mail S distributions in Pokémon Mystery Dungeon: Explorers of Sky",
      resolver,
      new Set(),
    );

    expect(stats.usedFallback).toBe(true);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.speciesId).toBe(25);
    expect(row.year).toBe(2009);
    expect(row.method).toBe("Wonder Mail S");
    expect(row.games).toBe("Mystery Dungeon: Explorers of Sky");
    expect(row.region).toBe("Japan");
    expect(row.notes).toContain("Recruited via Wonder Mail mission");
    expect(row.notes).toContain("Foggy Forest");
    expect(row.otName).toBeNull();
    expect(row.isShiny).toBe(0);
    // the item/TM reward row (no "joins") must not be fabricated into a row
    expect(stats.skippedNoSpecies).toBeGreaterThanOrEqual(1);
  });
});
