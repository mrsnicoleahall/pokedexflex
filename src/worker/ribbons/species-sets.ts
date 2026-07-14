// Curated, verified national-dex id sets for the rarity-class ribbon families,
// plus the canonical nature and Poké Ball name lists for the collector family.
// PURE DATA — no I/O. National dex ids are 1..1025.
//
// Every set below was verified against Bulbapedia on 2026-07-14; each set has a
// count-assertion test in tests/worker/species-sets.test.ts so a wrong or
// duplicated entry fails CI. priors.ts is intentionally left untouched — its
// LEGENDARY_IDS is a *lumped* prior (legendaries + mythicals + UBs + paradox)
// unsuitable for these *separated* achievement sets.

// Legendary Pokémon (proper) — EXCLUDES Mythicals, Ultra Beasts, and the
// non-box Paradox mons. Includes the box legendaries Koraidon (1007) and
// Miraidon (1008), which Bulbapedia dual-classifies as Legendary AND Paradox;
// they live here (not in PARADOX_IDS) so each set stays mutually exclusive.
// Source: https://bulbapedia.bulbagarden.net/wiki/Legendary_Pok%C3%A9mon
// (Bulbapedia states 71 Legendary Pokémon as of Gen IX.)
export const LEGENDARY_PROPER_IDS: readonly number[] = [
  144, 145, 146, 150,                                  // Gen 1 birds + Mewtwo
  243, 244, 245, 249, 250,                             // Gen 2 beasts + Lugia/Ho-Oh
  377, 378, 379, 380, 381, 382, 383, 384,              // Gen 3 Regis/Eon/weather/Rayquaza
  480, 481, 482, 483, 484, 485, 486, 487, 488,         // Gen 4 lake trio/creation/Heatran/Regigigas/Cresselia
  638, 639, 640, 641, 642, 643, 644, 645, 646,         // Gen 5 SoJ/Forces/Tao/Kyurem
  716, 717, 718,                                       // Gen 6 Xerneas/Yveltal/Zygarde
  772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 800, // Gen 7 Null/Silvally/Tapus/Cosmog line/Necrozma
  888, 889, 890, 891, 892, 894, 895, 896, 897, 898, 905, // Gen 8 Zacian/Zamazenta/Eternatus/Kubfu/Urshifu/Regi/Glastrier/Spectrier/Calyrex/Enamorus
  1001, 1002, 1003, 1004, 1007, 1008, 1014, 1015, 1016, 1017, 1024, // Gen 9 Ruinous/Koraidon/Miraidon/Loyal Three/Ogerpon/Terapagos
];

// Mythical Pokémon (23 as of Gen IX). Pecharunt (1025) is Mythical, not Legendary.
// Source: https://bulbapedia.bulbagarden.net/wiki/Mythical_Pok%C3%A9mon
export const MYTHICAL_IDS: readonly number[] = [
  151, 251, 385, 386, 489, 490, 491, 492, 493, 494,
  647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025,
];

// Fossil Pokémon — classic fossil-revived species (base + evolutions) through
// Gen 8's Galar chimeras. Gen 9 has no revivable fossils.
// Source: https://bulbapedia.bulbagarden.net/wiki/Fossil_Pok%C3%A9mon
export const FOSSIL_IDS: readonly number[] = [
  138, 139, 140, 141, 142,       // Kanto: Omanyte/Omastar, Kabuto/Kabutops, Aerodactyl
  345, 346, 347, 348,            // Hoenn: Lileep/Cradily, Anorith/Armaldo
  408, 409, 410, 411,            // Sinnoh: Cranidos/Rampardos, Shieldon/Bastiodon
  564, 565, 566, 567,            // Unova: Tirtouga/Carracosta, Archen/Archeops
  696, 697, 698, 699,            // Kalos: Tyrunt/Tyrantrum, Amaura/Aurorus
  880, 881, 882, 883,            // Galar: Dracozolt, Arctozolt, Dracovish, Arctovish
];

// Baby Pokémon — the official breeding-only pre-evolutions (19 as of Gen IX).
// Source: https://bulbapedia.bulbagarden.net/wiki/Baby_Pok%C3%A9mon
export const BABY_IDS: readonly number[] = [
  172, 173, 174, 175, 236, 238, 239, 240,  // Gen 2
  298, 360,                                 // Gen 3: Azurill, Wynaut
  406, 433, 438, 439, 440, 446, 447, 458,   // Gen 4: Budew, Chingling, Bonsly, Mime Jr., Happiny, Munchlax, Riolu, Mantyke
  848,                                      // Gen 8: Toxel
];

// Ultra Beasts (11). Necrozma is a Legendary, not a UB, so it is excluded.
// Source: https://bulbapedia.bulbagarden.net/wiki/Ultra_Beast
export const ULTRA_BEAST_IDS: readonly number[] = [
  793, 794, 795, 796, 797, 798, 799,  // Nihilego, Buzzwole, Pheromosa, Xurkitree, Celesteela, Kartana, Guzzlord
  803, 804, 805, 806,                 // Poipole, Naganadel, Stakataka, Blacephalon
];

// Paradox Pokémon (20) — the 22 Gen 9 Paradox mons MINUS the two box legendaries
// Koraidon (1007) and Miraidon (1008), which are tracked as Legendaries above.
// Source: https://bulbapedia.bulbagarden.net/wiki/Paradox_Pok%C3%A9mon
export const PARADOX_IDS: readonly number[] = [
  984, 985, 986, 987, 988, 989,       // Ancient: Great Tusk .. Sandy Shocks
  990, 991, 992, 993, 994, 995,       // Future: Iron Treads .. Iron Thorns
  1005, 1006, 1009, 1010,             // Roaring Moon, Iron Valiant, Walking Wake, Iron Leaves
  1020, 1021, 1022, 1023,             // Gouging Fire, Raging Bolt, Iron Boulder, Iron Crown
];

// All 25 natures (lowercase, for case-insensitive matching against stored values).
// Source: https://bulbapedia.bulbagarden.net/wiki/Nature
export const NATURE_NAMES: readonly string[] = [
  "hardy", "lonely", "brave", "adamant", "naughty",
  "bold", "docile", "relaxed", "impish", "lax",
  "timid", "hasty", "serious", "jolly", "naive",
  "modest", "mild", "quiet", "bashful", "rash",
  "calm", "gentle", "sassy", "careful", "quirky",
];

// Every Poké Ball obtainable through Gen VII (USUM) — matches the app's save
// import scope (USUM). Source: https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9_Ball
export const BALL_TYPES: readonly string[] = [
  "poké ball", "great ball", "ultra ball", "master ball",
  "safari ball", "net ball", "dive ball", "nest ball", "repeat ball",
  "timer ball", "luxury ball", "premier ball", "dusk ball", "heal ball",
  "quick ball", "cherish ball", "fast ball", "level ball", "lure ball",
  "heavy ball", "love ball", "friend ball", "moon ball", "sport ball",
  "dream ball", "beast ball", "park ball",
];
