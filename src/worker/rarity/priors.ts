// Rarity priors: curated baseline "how rare is this species, independent of
// any ownership data we've observed" table. Pure, deterministic, no I/O.
//
// Species ids are national dex numbers (1..1025).

export type RarityTier = "common" | "uncommon" | "rare" | "epic" | "legendary";

/**
 * Legendaries, mythicals, Ultra Beasts, and paradox species across gens 1-9.
 * Not exhaustive by design (a curated prior, not a dex audit) but aims to be
 * a sensible, reasonably complete baseline.
 */
export const LEGENDARY_IDS: Set<number> = new Set([
  // Gen 1: legendary birds + Mewtwo + Mew
  144, 145, 146, 150, 151,
  // Gen 2: legendary beasts + Lugia/Ho-Oh + Celebi
  243, 244, 245, 249, 250, 251,
  // Gen 3: Regis, Eon duo, weather trio, Jirachi, Deoxys
  377, 378, 379, 380, 381, 382, 383, 384, 385, 386,
  // Gen 4: lake trio, Dialga/Palkia, Heatran, Regigigas, Giratina,
  // Cresselia, Phione, Manaphy, Darkrai, Shaymin, Arceus
  480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493,
  // Gen 5: Victini
  494,
  // Gen 5: swords of justice, forces of nature, dragons, Kyurem,
  // Keldeo, Meloetta, Genesect
  638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649,
  // Gen 6: Xerneas/Yveltal/Zygarde, Diancie, Hoopa, Volcanion
  716, 717, 718, 719, 720, 721,
  // Gen 7: Type: Null / Silvally
  772, 773,
  // Gen 7: tapus, cosmog line, Ultra Beasts, Necrozma, Magearna,
  // Marshadow, Poipole line, Stakataka, Blacephalon, Zeraora, Meltan/Melmetal
  785, 786, 787, 788, 789, 790, 791, 792, 793, 794, 795, 796, 797, 798, 799,
  800, 801, 802, 803, 804, 805, 806, 807, 808, 809,
  // Gen 8: Zacian/Zamazenta, Eternatus, Kubfu/Urshifu, Zarude,
  // Regieleki/Regidrago, Glastrier/Spectrier, Calyrex
  888, 889, 890, 891, 892, 893, 894, 895, 896, 897, 898,
  // Gen 8 (Hisui): Enamorus
  905,
  // Gen 9: paradox species (Great Tusk .. Iron Thorns; excludes Baxcalibur
  // line which is a pseudo-legendary, tracked separately)
  984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 996, 997,
  // Gen 9: treasures of ruin, loyal three, box-art legendaries,
  // Walking Wake/Iron Leaves
  1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010,
  // Gen 9: Ogerpon, Terapagos, Pecharunt
  1017, 1024, 1025,
]);

/** Pseudo-legendaries: iconic, hard-to-raise fully-evolved rare species. */
export const PSEUDO_IDS = new Set([149, 248, 373, 376, 445, 635, 706, 784, 887, 998]);

/** Final-stage starter evolutions across generations. */
export const STARTER_FINAL_IDS: Set<number> = new Set([
  3, 6, 9, // Kanto: Venusaur, Charizard, Blastoise
  154, 157, 160, // Johto: Meganium, Typhlosion, Feraligatr
  254, 257, 260, // Hoenn: Sceptile, Blaziken, Swampert
  389, 392, 395, // Sinnoh: Torterra, Infernape, Empoleon
  497, 500, 503, // Unova: Serperior, Emboar, Samurott
  652, 655, 658, // Kalos: Chesnaught, Delphox, Greninja
  724, 727, 730, // Alola: Decidueye, Incineroar, Primarina
  812, 815, 818, // Galar: Rillaboom, Cinderace, Inteleon
  908, 911, 914, // Paldea: Meowscarada, Skeledirge, Quaquaval
]);

/**
 * Baseline scarcity prior for a species, independent of any observed
 * ownership data. Lower = rarer.
 */
export function priorRate(speciesId: number): number {
  if (LEGENDARY_IDS.has(speciesId)) return 0.02;
  if (PSEUDO_IDS.has(speciesId)) return 0.08;
  if (STARTER_FINAL_IDS.has(speciesId)) return 0.3;
  return 0.75;
}
