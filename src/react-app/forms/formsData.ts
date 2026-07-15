// src/react-app/forms/formsData.ts
//
// Static reference dataset for the Forms gallery (browse-only). Each form's
// `slug` is the PokeAPI 2D default-sprite filename stem, served + R2-cached
// through the worker at /sprites/form/:slug. Generated from PokeAPI's
// pokemon-form endpoint; regenerate with scripts/gen-forms if forms change.
// Cosmetic families (Vivillon, Furfrou, Unown, Alcremie, Flabébé line) have no
// HOME 3D render, so the whole gallery deliberately uses the 2D sprite set for
// a consistent look.

export type FormEntry = { slug: string; name: string };
export type FormGroup = { key: string; label: string; blurb: string; forms: FormEntry[] };

export const FORM_GROUPS: FormGroup[] = [
  {
    "key": "regional",
    "label": "Regional",
    "blurb": "Region-specific variants from Alola, Galar, Hisui, and Paldea.",
    "forms": [
      {
        "slug": "10091",
        "name": "Alolan Rattata"
      },
      {
        "slug": "10092",
        "name": "Alolan Raticate"
      },
      {
        "slug": "10093",
        "name": "Alolan Raticate (Totem)"
      },
      {
        "slug": "10100",
        "name": "Alolan Raichu"
      },
      {
        "slug": "10101",
        "name": "Alolan Sandshrew"
      },
      {
        "slug": "10102",
        "name": "Alolan Sandslash"
      },
      {
        "slug": "10103",
        "name": "Alolan Vulpix"
      },
      {
        "slug": "10104",
        "name": "Alolan Ninetales"
      },
      {
        "slug": "10105",
        "name": "Alolan Diglett"
      },
      {
        "slug": "10106",
        "name": "Alolan Dugtrio"
      },
      {
        "slug": "10107",
        "name": "Alolan Meowth"
      },
      {
        "slug": "10108",
        "name": "Alolan Persian"
      },
      {
        "slug": "10109",
        "name": "Alolan Geodude"
      },
      {
        "slug": "10110",
        "name": "Alolan Graveler"
      },
      {
        "slug": "10111",
        "name": "Alolan Golem"
      },
      {
        "slug": "10112",
        "name": "Alolan Grimer"
      },
      {
        "slug": "10113",
        "name": "Alolan Muk"
      },
      {
        "slug": "10114",
        "name": "Alolan Exeggutor"
      },
      {
        "slug": "10115",
        "name": "Alolan Marowak"
      },
      {
        "slug": "10161",
        "name": "Galarian Meowth"
      },
      {
        "slug": "10162",
        "name": "Galarian Ponyta"
      },
      {
        "slug": "10163",
        "name": "Galarian Rapidash"
      },
      {
        "slug": "10164",
        "name": "Galarian Slowpoke"
      },
      {
        "slug": "10165",
        "name": "Galarian Slowbro"
      },
      {
        "slug": "10166",
        "name": "Galarian Farfetch'd"
      },
      {
        "slug": "10167",
        "name": "Galarian Weezing"
      },
      {
        "slug": "10168",
        "name": "Galarian Mr. Mime"
      },
      {
        "slug": "10169",
        "name": "Galarian Articuno"
      },
      {
        "slug": "10170",
        "name": "Galarian Zapdos"
      },
      {
        "slug": "10171",
        "name": "Galarian Moltres"
      },
      {
        "slug": "10172",
        "name": "Galarian Slowking"
      },
      {
        "slug": "10173",
        "name": "Galarian Corsola"
      },
      {
        "slug": "10174",
        "name": "Galarian Zigzagoon"
      },
      {
        "slug": "10175",
        "name": "Galarian Linoone"
      },
      {
        "slug": "10176",
        "name": "Galarian Darumaka"
      },
      {
        "slug": "10177",
        "name": "Galarian Darmanitan"
      },
      {
        "slug": "10178",
        "name": "Galarian Darmanitan (Zen)"
      },
      {
        "slug": "10179",
        "name": "Galarian Yamask"
      },
      {
        "slug": "10180",
        "name": "Galarian Stunfisk"
      },
      {
        "slug": "10229",
        "name": "Hisuian Growlithe"
      },
      {
        "slug": "10230",
        "name": "Hisuian Arcanine"
      },
      {
        "slug": "10231",
        "name": "Hisuian Voltorb"
      },
      {
        "slug": "10232",
        "name": "Hisuian Electrode"
      },
      {
        "slug": "10233",
        "name": "Hisuian Typhlosion"
      },
      {
        "slug": "10234",
        "name": "Hisuian Qwilfish"
      },
      {
        "slug": "10235",
        "name": "Hisuian Sneasel"
      },
      {
        "slug": "10236",
        "name": "Hisuian Samurott"
      },
      {
        "slug": "10237",
        "name": "Hisuian Lilligant"
      },
      {
        "slug": "10238",
        "name": "Hisuian Zorua"
      },
      {
        "slug": "10239",
        "name": "Hisuian Zoroark"
      },
      {
        "slug": "10240",
        "name": "Hisuian Braviary"
      },
      {
        "slug": "10241",
        "name": "Hisuian Sliggoo"
      },
      {
        "slug": "10242",
        "name": "Hisuian Goodra"
      },
      {
        "slug": "10243",
        "name": "Hisuian Avalugg"
      },
      {
        "slug": "10244",
        "name": "Hisuian Decidueye"
      },
      {
        "slug": "10250",
        "name": "Paldean Tauros (Combat)"
      },
      {
        "slug": "10251",
        "name": "Paldean Tauros (Blaze)"
      },
      {
        "slug": "10252",
        "name": "Paldean Tauros (Aqua)"
      },
      {
        "slug": "10253",
        "name": "Paldean Wooper"
      }
    ]
  },
  {
    "key": "vivillon",
    "label": "Vivillon",
    "blurb": "Twenty wing patterns determined by the trainer's real-world region.",
    "forms": [
      {
        "slug": "666",
        "name": "Meadow"
      },
      {
        "slug": "666-icy-snow",
        "name": "Icy Snow"
      },
      {
        "slug": "666-polar",
        "name": "Polar"
      },
      {
        "slug": "666-tundra",
        "name": "Tundra"
      },
      {
        "slug": "666-continental",
        "name": "Continental"
      },
      {
        "slug": "666-garden",
        "name": "Garden"
      },
      {
        "slug": "666-elegant",
        "name": "Elegant"
      },
      {
        "slug": "666-modern",
        "name": "Modern"
      },
      {
        "slug": "666-marine",
        "name": "Marine"
      },
      {
        "slug": "666-archipelago",
        "name": "Archipelago"
      },
      {
        "slug": "666-high-plains",
        "name": "High Plains"
      },
      {
        "slug": "666-sandstorm",
        "name": "Sandstorm"
      },
      {
        "slug": "666-river",
        "name": "River"
      },
      {
        "slug": "666-monsoon",
        "name": "Monsoon"
      },
      {
        "slug": "666-savanna",
        "name": "Savanna"
      },
      {
        "slug": "666-sun",
        "name": "Sun"
      },
      {
        "slug": "666-ocean",
        "name": "Ocean"
      },
      {
        "slug": "666-jungle",
        "name": "Jungle"
      },
      {
        "slug": "666-fancy",
        "name": "Fancy"
      },
      {
        "slug": "666-poke-ball",
        "name": "Poke Ball"
      }
    ]
  },
  {
    "key": "alcremie",
    "label": "Alcremie",
    "blurb": "Every cream-and-sweet decoration combination.",
    "forms": [
      {
        "slug": "869",
        "name": "Vanilla Cream Strawberry"
      },
      {
        "slug": "869-ruby-cream-strawberry-sweet",
        "name": "Ruby Cream Strawberry"
      },
      {
        "slug": "869-matcha-cream-strawberry-sweet",
        "name": "Matcha Cream Strawberry"
      },
      {
        "slug": "869-mint-cream-strawberry-sweet",
        "name": "Mint Cream Strawberry"
      },
      {
        "slug": "869-lemon-cream-strawberry-sweet",
        "name": "Lemon Cream Strawberry"
      },
      {
        "slug": "869-salted-cream-strawberry-sweet",
        "name": "Salted Cream Strawberry"
      },
      {
        "slug": "869-ruby-swirl-strawberry-sweet",
        "name": "Ruby Swirl Strawberry"
      },
      {
        "slug": "869-caramel-swirl-strawberry-sweet",
        "name": "Caramel Swirl Strawberry"
      },
      {
        "slug": "869-rainbow-swirl-strawberry-sweet",
        "name": "Rainbow Swirl Strawberry"
      },
      {
        "slug": "10223",
        "name": "Gmax"
      },
      {
        "slug": "869-vanilla-cream-berry-sweet",
        "name": "Vanilla Cream Berry"
      },
      {
        "slug": "869-ruby-cream-berry-sweet",
        "name": "Ruby Cream Berry"
      },
      {
        "slug": "869-matcha-cream-berry-sweet",
        "name": "Matcha Cream Berry"
      },
      {
        "slug": "869-mint-cream-berry-sweet",
        "name": "Mint Cream Berry"
      },
      {
        "slug": "869-lemon-cream-berry-sweet",
        "name": "Lemon Cream Berry"
      },
      {
        "slug": "869-salted-cream-berry-sweet",
        "name": "Salted Cream Berry"
      },
      {
        "slug": "869-ruby-swirl-berry-sweet",
        "name": "Ruby Swirl Berry"
      },
      {
        "slug": "869-caramel-swirl-berry-sweet",
        "name": "Caramel Swirl Berry"
      },
      {
        "slug": "869-rainbow-swirl-berry-sweet",
        "name": "Rainbow Swirl Berry"
      },
      {
        "slug": "869-vanilla-cream-love-sweet",
        "name": "Vanilla Cream Love"
      },
      {
        "slug": "869-ruby-cream-love-sweet",
        "name": "Ruby Cream Love"
      },
      {
        "slug": "869-matcha-cream-love-sweet",
        "name": "Matcha Cream Love"
      },
      {
        "slug": "869-mint-cream-love-sweet",
        "name": "Mint Cream Love"
      },
      {
        "slug": "869-lemon-cream-love-sweet",
        "name": "Lemon Cream Love"
      },
      {
        "slug": "869-salted-cream-love-sweet",
        "name": "Salted Cream Love"
      },
      {
        "slug": "869-ruby-swirl-love-sweet",
        "name": "Ruby Swirl Love"
      },
      {
        "slug": "869-caramel-swirl-love-sweet",
        "name": "Caramel Swirl Love"
      },
      {
        "slug": "869-rainbow-swirl-love-sweet",
        "name": "Rainbow Swirl Love"
      },
      {
        "slug": "869-vanilla-cream-star-sweet",
        "name": "Vanilla Cream Star"
      },
      {
        "slug": "869-ruby-cream-star-sweet",
        "name": "Ruby Cream Star"
      },
      {
        "slug": "869-matcha-cream-star-sweet",
        "name": "Matcha Cream Star"
      },
      {
        "slug": "869-mint-cream-star-sweet",
        "name": "Mint Cream Star"
      },
      {
        "slug": "869-lemon-cream-star-sweet",
        "name": "Lemon Cream Star"
      },
      {
        "slug": "869-salted-cream-star-sweet",
        "name": "Salted Cream Star"
      },
      {
        "slug": "869-ruby-swirl-star-sweet",
        "name": "Ruby Swirl Star"
      },
      {
        "slug": "869-caramel-swirl-star-sweet",
        "name": "Caramel Swirl Star"
      },
      {
        "slug": "869-rainbow-swirl-star-sweet",
        "name": "Rainbow Swirl Star"
      },
      {
        "slug": "869-vanilla-cream-clover-sweet",
        "name": "Vanilla Cream Clover"
      },
      {
        "slug": "869-ruby-cream-clover-sweet",
        "name": "Ruby Cream Clover"
      },
      {
        "slug": "869-matcha-cream-clover-sweet",
        "name": "Matcha Cream Clover"
      },
      {
        "slug": "869-mint-cream-clover-sweet",
        "name": "Mint Cream Clover"
      },
      {
        "slug": "869-lemon-cream-clover-sweet",
        "name": "Lemon Cream Clover"
      },
      {
        "slug": "869-salted-cream-clover-sweet",
        "name": "Salted Cream Clover"
      },
      {
        "slug": "869-ruby-swirl-clover-sweet",
        "name": "Ruby Swirl Clover"
      },
      {
        "slug": "869-caramel-swirl-clover-sweet",
        "name": "Caramel Swirl Clover"
      },
      {
        "slug": "869-rainbow-swirl-clover-sweet",
        "name": "Rainbow Swirl Clover"
      },
      {
        "slug": "869-vanilla-cream-flower-sweet",
        "name": "Vanilla Cream Flower"
      },
      {
        "slug": "869-ruby-cream-flower-sweet",
        "name": "Ruby Cream Flower"
      },
      {
        "slug": "869-matcha-cream-flower-sweet",
        "name": "Matcha Cream Flower"
      },
      {
        "slug": "869-mint-cream-flower-sweet",
        "name": "Mint Cream Flower"
      },
      {
        "slug": "869-lemon-cream-flower-sweet",
        "name": "Lemon Cream Flower"
      },
      {
        "slug": "869-salted-cream-flower-sweet",
        "name": "Salted Cream Flower"
      },
      {
        "slug": "869-ruby-swirl-flower-sweet",
        "name": "Ruby Swirl Flower"
      },
      {
        "slug": "869-caramel-swirl-flower-sweet",
        "name": "Caramel Swirl Flower"
      },
      {
        "slug": "869-rainbow-swirl-flower-sweet",
        "name": "Rainbow Swirl Flower"
      },
      {
        "slug": "869-vanilla-cream-ribbon-sweet",
        "name": "Vanilla Cream Ribbon"
      },
      {
        "slug": "869-ruby-cream-ribbon-sweet",
        "name": "Ruby Cream Ribbon"
      },
      {
        "slug": "869-matcha-cream-ribbon-sweet",
        "name": "Matcha Cream Ribbon"
      },
      {
        "slug": "869-mint-cream-ribbon-sweet",
        "name": "Mint Cream Ribbon"
      },
      {
        "slug": "869-lemon-cream-ribbon-sweet",
        "name": "Lemon Cream Ribbon"
      },
      {
        "slug": "869-salted-cream-ribbon-sweet",
        "name": "Salted Cream Ribbon"
      },
      {
        "slug": "869-ruby-swirl-ribbon-sweet",
        "name": "Ruby Swirl Ribbon"
      },
      {
        "slug": "869-caramel-swirl-ribbon-sweet",
        "name": "Caramel Swirl Ribbon"
      },
      {
        "slug": "869-rainbow-swirl-ribbon-sweet",
        "name": "Rainbow Swirl Ribbon"
      }
    ]
  },
  {
    "key": "unown",
    "label": "Unown",
    "blurb": "The full alphabet, plus ! and ?.",
    "forms": [
      {
        "slug": "201",
        "name": "A"
      },
      {
        "slug": "201-b",
        "name": "B"
      },
      {
        "slug": "201-c",
        "name": "C"
      },
      {
        "slug": "201-d",
        "name": "D"
      },
      {
        "slug": "201-e",
        "name": "E"
      },
      {
        "slug": "201-f",
        "name": "F"
      },
      {
        "slug": "201-g",
        "name": "G"
      },
      {
        "slug": "201-h",
        "name": "H"
      },
      {
        "slug": "201-i",
        "name": "I"
      },
      {
        "slug": "201-j",
        "name": "J"
      },
      {
        "slug": "201-k",
        "name": "K"
      },
      {
        "slug": "201-l",
        "name": "L"
      },
      {
        "slug": "201-m",
        "name": "M"
      },
      {
        "slug": "201-n",
        "name": "N"
      },
      {
        "slug": "201-o",
        "name": "O"
      },
      {
        "slug": "201-p",
        "name": "P"
      },
      {
        "slug": "201-q",
        "name": "Q"
      },
      {
        "slug": "201-r",
        "name": "R"
      },
      {
        "slug": "201-s",
        "name": "S"
      },
      {
        "slug": "201-t",
        "name": "T"
      },
      {
        "slug": "201-u",
        "name": "U"
      },
      {
        "slug": "201-v",
        "name": "V"
      },
      {
        "slug": "201-w",
        "name": "W"
      },
      {
        "slug": "201-x",
        "name": "X"
      },
      {
        "slug": "201-y",
        "name": "Y"
      },
      {
        "slug": "201-z",
        "name": "Z"
      },
      {
        "slug": "201-exclamation",
        "name": "!"
      },
      {
        "slug": "201-question",
        "name": "?"
      }
    ]
  },
  {
    "key": "furfrou",
    "label": "Furfrou",
    "blurb": "Every groomed trim style.",
    "forms": [
      {
        "slug": "676",
        "name": "Natural"
      },
      {
        "slug": "676-heart",
        "name": "Heart"
      },
      {
        "slug": "676-star",
        "name": "Star"
      },
      {
        "slug": "676-diamond",
        "name": "Diamond"
      },
      {
        "slug": "676-debutante",
        "name": "Debutante"
      },
      {
        "slug": "676-matron",
        "name": "Matron"
      },
      {
        "slug": "676-dandy",
        "name": "Dandy"
      },
      {
        "slug": "676-la-reine",
        "name": "La Reine"
      },
      {
        "slug": "676-kabuki",
        "name": "Kabuki"
      },
      {
        "slug": "676-pharaoh",
        "name": "Pharaoh"
      }
    ]
  },
  {
    "key": "flowers",
    "label": "Flabébé Line",
    "blurb": "Flabébé, Floette, and Florges in every flower color.",
    "forms": [
      {
        "slug": "669",
        "name": "Flabébé Red"
      },
      {
        "slug": "670",
        "name": "Floette Red"
      },
      {
        "slug": "671",
        "name": "Florges Red"
      },
      {
        "slug": "669-yellow",
        "name": "Flabébé Yellow"
      },
      {
        "slug": "669-orange",
        "name": "Flabébé Orange"
      },
      {
        "slug": "669-blue",
        "name": "Flabébé Blue"
      },
      {
        "slug": "669-white",
        "name": "Flabébé White"
      },
      {
        "slug": "670-yellow",
        "name": "Floette Yellow"
      },
      {
        "slug": "670-orange",
        "name": "Floette Orange"
      },
      {
        "slug": "670-blue",
        "name": "Floette Blue"
      },
      {
        "slug": "670-white",
        "name": "Floette White"
      },
      {
        "slug": "671-yellow",
        "name": "Florges Yellow"
      },
      {
        "slug": "671-orange",
        "name": "Florges Orange"
      },
      {
        "slug": "671-blue",
        "name": "Florges Blue"
      },
      {
        "slug": "671-white",
        "name": "Florges White"
      },
      {
        "slug": "10061",
        "name": "Floette Eternal"
      },
      {
        "slug": "10296",
        "name": "Floette Mega"
      }
    ]
  },
  {
    "key": "pikachu",
    "label": "Pikachu Caps",
    "blurb": "Ash's caps and cosplay outfits.",
    "forms": [
      {
        "slug": "10080",
        "name": "Rock Star"
      },
      {
        "slug": "10081",
        "name": "Belle"
      },
      {
        "slug": "10082",
        "name": "Pop Star"
      },
      {
        "slug": "10083",
        "name": "Phd"
      },
      {
        "slug": "10084",
        "name": "Libre"
      },
      {
        "slug": "10085",
        "name": "Cosplay"
      },
      {
        "slug": "10094",
        "name": "Original Cap"
      },
      {
        "slug": "10095",
        "name": "Hoenn Cap"
      },
      {
        "slug": "10096",
        "name": "Sinnoh Cap"
      },
      {
        "slug": "10097",
        "name": "Unova Cap"
      },
      {
        "slug": "10098",
        "name": "Kalos Cap"
      },
      {
        "slug": "10099",
        "name": "Alola Cap"
      },
      {
        "slug": "10148",
        "name": "Partner Cap"
      },
      {
        "slug": "10160",
        "name": "World Cap"
      },
      {
        "slug": "10199",
        "name": "Gmax"
      }
    ]
  },
  {
    "key": "rotom",
    "label": "Rotom",
    "blurb": "Rotom's five appliance possessions.",
    "forms": [
      {
        "slug": "10008",
        "name": "Heat"
      },
      {
        "slug": "10009",
        "name": "Wash"
      },
      {
        "slug": "10010",
        "name": "Frost"
      },
      {
        "slug": "10011",
        "name": "Fan"
      },
      {
        "slug": "10012",
        "name": "Mow"
      }
    ]
  },
  {
    "key": "oricorio",
    "label": "Oricorio",
    "blurb": "The four nectar-fueled dance styles.",
    "forms": [
      {
        "slug": "741",
        "name": "Baile"
      },
      {
        "slug": "10123",
        "name": "Pom-Pom"
      },
      {
        "slug": "10124",
        "name": "Pa'u"
      },
      {
        "slug": "10125",
        "name": "Sensu"
      }
    ]
  },
  {
    "key": "deoxys",
    "label": "Deoxys",
    "blurb": "Normal, Attack, Defense, and Speed formes.",
    "forms": [
      {
        "slug": "386",
        "name": "Normal"
      },
      {
        "slug": "10001",
        "name": "Attack"
      },
      {
        "slug": "10002",
        "name": "Defense"
      },
      {
        "slug": "10003",
        "name": "Speed"
      }
    ]
  },
  {
    "key": "mega",
    "label": "Mega Evolutions",
    "blurb": "Every Mega Evolution and Primal Reversion.",
    "forms": [
      {
        "slug": "10033",
        "name": "Mega Venusaur"
      },
      {
        "slug": "10034",
        "name": "Mega Charizard X"
      },
      {
        "slug": "10035",
        "name": "Mega Charizard Y"
      },
      {
        "slug": "10036",
        "name": "Mega Blastoise"
      },
      {
        "slug": "10037",
        "name": "Mega Alakazam"
      },
      {
        "slug": "10038",
        "name": "Mega Gengar"
      },
      {
        "slug": "10039",
        "name": "Mega Kangaskhan"
      },
      {
        "slug": "10040",
        "name": "Mega Pinsir"
      },
      {
        "slug": "10041",
        "name": "Mega Gyarados"
      },
      {
        "slug": "10042",
        "name": "Mega Aerodactyl"
      },
      {
        "slug": "10043",
        "name": "Mega Mewtwo X"
      },
      {
        "slug": "10044",
        "name": "Mega Mewtwo Y"
      },
      {
        "slug": "10045",
        "name": "Mega Ampharos"
      },
      {
        "slug": "10046",
        "name": "Mega Scizor"
      },
      {
        "slug": "10047",
        "name": "Mega Heracross"
      },
      {
        "slug": "10048",
        "name": "Mega Houndoom"
      },
      {
        "slug": "10049",
        "name": "Mega Tyranitar"
      },
      {
        "slug": "10050",
        "name": "Mega Blaziken"
      },
      {
        "slug": "10051",
        "name": "Mega Gardevoir"
      },
      {
        "slug": "10052",
        "name": "Mega Mawile"
      },
      {
        "slug": "10053",
        "name": "Mega Aggron"
      },
      {
        "slug": "10054",
        "name": "Mega Medicham"
      },
      {
        "slug": "10055",
        "name": "Mega Manectric"
      },
      {
        "slug": "10056",
        "name": "Mega Banette"
      },
      {
        "slug": "10057",
        "name": "Mega Absol"
      },
      {
        "slug": "10058",
        "name": "Mega Garchomp"
      },
      {
        "slug": "10059",
        "name": "Mega Lucario"
      },
      {
        "slug": "10060",
        "name": "Mega Abomasnow"
      },
      {
        "slug": "10062",
        "name": "Mega Latias"
      },
      {
        "slug": "10063",
        "name": "Mega Latios"
      },
      {
        "slug": "10064",
        "name": "Mega Swampert"
      },
      {
        "slug": "10065",
        "name": "Mega Sceptile"
      },
      {
        "slug": "10066",
        "name": "Mega Sableye"
      },
      {
        "slug": "10067",
        "name": "Mega Altaria"
      },
      {
        "slug": "10068",
        "name": "Mega Gallade"
      },
      {
        "slug": "10069",
        "name": "Mega Audino"
      },
      {
        "slug": "10070",
        "name": "Mega Sharpedo"
      },
      {
        "slug": "10071",
        "name": "Mega Slowbro"
      },
      {
        "slug": "10072",
        "name": "Mega Steelix"
      },
      {
        "slug": "10073",
        "name": "Mega Pidgeot"
      },
      {
        "slug": "10074",
        "name": "Mega Glalie"
      },
      {
        "slug": "10075",
        "name": "Mega Diancie"
      },
      {
        "slug": "10076",
        "name": "Mega Metagross"
      },
      {
        "slug": "10077",
        "name": "Kyogre (Primal)"
      },
      {
        "slug": "10078",
        "name": "Groudon (Primal)"
      },
      {
        "slug": "10079",
        "name": "Mega Rayquaza"
      },
      {
        "slug": "10087",
        "name": "Mega Camerupt"
      },
      {
        "slug": "10088",
        "name": "Mega Lopunny"
      },
      {
        "slug": "10089",
        "name": "Mega Salamence"
      },
      {
        "slug": "10090",
        "name": "Mega Beedrill"
      },
      {
        "slug": "10278",
        "name": "Mega Clefable"
      },
      {
        "slug": "10279",
        "name": "Mega Victreebel"
      },
      {
        "slug": "10280",
        "name": "Mega Starmie"
      },
      {
        "slug": "10281",
        "name": "Mega Dragonite"
      },
      {
        "slug": "10282",
        "name": "Mega Meganium"
      },
      {
        "slug": "10283",
        "name": "Mega Feraligatr"
      },
      {
        "slug": "10284",
        "name": "Mega Skarmory"
      },
      {
        "slug": "10285",
        "name": "Mega Froslass"
      },
      {
        "slug": "10286",
        "name": "Mega Emboar"
      },
      {
        "slug": "10287",
        "name": "Mega Excadrill"
      },
      {
        "slug": "10288",
        "name": "Mega Scolipede"
      },
      {
        "slug": "10289",
        "name": "Mega Scrafty"
      },
      {
        "slug": "10290",
        "name": "Mega Eelektross"
      },
      {
        "slug": "10291",
        "name": "Mega Chandelure"
      },
      {
        "slug": "10292",
        "name": "Mega Chesnaught"
      },
      {
        "slug": "10293",
        "name": "Mega Delphox"
      },
      {
        "slug": "10294",
        "name": "Mega Greninja"
      },
      {
        "slug": "10295",
        "name": "Mega Pyroar"
      },
      {
        "slug": "10296",
        "name": "Mega Floette"
      },
      {
        "slug": "10297",
        "name": "Mega Malamar"
      },
      {
        "slug": "10298",
        "name": "Mega Barbaracle"
      },
      {
        "slug": "10299",
        "name": "Mega Dragalge"
      },
      {
        "slug": "10300",
        "name": "Mega Hawlucha"
      },
      {
        "slug": "10302",
        "name": "Mega Drampa"
      },
      {
        "slug": "10303",
        "name": "Mega Falinks"
      },
      {
        "slug": "10304",
        "name": "Mega Raichu X"
      },
      {
        "slug": "10305",
        "name": "Mega Raichu Y"
      },
      {
        "slug": "10306",
        "name": "Mega Chimecho"
      },
      {
        "slug": "10307",
        "name": "Mega Absol Z"
      },
      {
        "slug": "10308",
        "name": "Mega Staraptor"
      },
      {
        "slug": "10309",
        "name": "Mega Garchomp Z"
      },
      {
        "slug": "10310",
        "name": "Mega Lucario Z"
      },
      {
        "slug": "10311",
        "name": "Mega Heatran"
      },
      {
        "slug": "10312",
        "name": "Mega Darkrai"
      },
      {
        "slug": "10313",
        "name": "Mega Golurk"
      },
      {
        "slug": "10314",
        "name": "Mega Meowstic Male"
      },
      {
        "slug": "10315",
        "name": "Mega Crabominable"
      },
      {
        "slug": "10316",
        "name": "Mega Golisopod"
      },
      {
        "slug": "10317",
        "name": "Mega Magearna"
      },
      {
        "slug": "10318",
        "name": "Mega Magearna Original"
      },
      {
        "slug": "10319",
        "name": "Mega Zeraora"
      },
      {
        "slug": "10320",
        "name": "Mega Scovillain"
      },
      {
        "slug": "10321",
        "name": "Mega Glimmora"
      },
      {
        "slug": "10322",
        "name": "Mega Tatsugiri Curly"
      },
      {
        "slug": "10323",
        "name": "Mega Tatsugiri Droopy"
      },
      {
        "slug": "10324",
        "name": "Mega Tatsugiri Stretchy"
      },
      {
        "slug": "10325",
        "name": "Mega Baxcalibur"
      },
      {
        "slug": "10326",
        "name": "Mega Meowstic Female"
      }
    ]
  },
  {
    "key": "gmax",
    "label": "Gigantamax",
    "blurb": "Gigantamax forms from the Galar region.",
    "forms": [
      {
        "slug": "10195",
        "name": "Venusaur"
      },
      {
        "slug": "10196",
        "name": "Charizard"
      },
      {
        "slug": "10197",
        "name": "Blastoise"
      },
      {
        "slug": "10198",
        "name": "Butterfree"
      },
      {
        "slug": "10199",
        "name": "Pikachu"
      },
      {
        "slug": "10200",
        "name": "Meowth"
      },
      {
        "slug": "10201",
        "name": "Machamp"
      },
      {
        "slug": "10202",
        "name": "Gengar"
      },
      {
        "slug": "10203",
        "name": "Kingler"
      },
      {
        "slug": "10204",
        "name": "Lapras"
      },
      {
        "slug": "10205",
        "name": "Eevee"
      },
      {
        "slug": "10206",
        "name": "Snorlax"
      },
      {
        "slug": "10207",
        "name": "Garbodor"
      },
      {
        "slug": "10208",
        "name": "Melmetal"
      },
      {
        "slug": "10209",
        "name": "Rillaboom"
      },
      {
        "slug": "10210",
        "name": "Cinderace"
      },
      {
        "slug": "10211",
        "name": "Inteleon"
      },
      {
        "slug": "10212",
        "name": "Corviknight"
      },
      {
        "slug": "10213",
        "name": "Orbeetle"
      },
      {
        "slug": "10214",
        "name": "Drednaw"
      },
      {
        "slug": "10215",
        "name": "Coalossal"
      },
      {
        "slug": "10216",
        "name": "Flapple"
      },
      {
        "slug": "10217",
        "name": "Appletun"
      },
      {
        "slug": "10218",
        "name": "Sandaconda"
      },
      {
        "slug": "10219",
        "name": "Toxtricity Amped"
      },
      {
        "slug": "10220",
        "name": "Centiskorch"
      },
      {
        "slug": "10221",
        "name": "Hatterene"
      },
      {
        "slug": "10222",
        "name": "Grimmsnarl"
      },
      {
        "slug": "10223",
        "name": "Alcremie"
      },
      {
        "slug": "10224",
        "name": "Copperajah"
      },
      {
        "slug": "10225",
        "name": "Duraludon"
      },
      {
        "slug": "10226",
        "name": "Urshifu Single Strike"
      },
      {
        "slug": "10227",
        "name": "Urshifu Rapid Strike"
      },
      {
        "slug": "10228",
        "name": "Toxtricity Low Key"
      }
    ]
  }
];

export const DEFAULT_FORM_GROUP = FORM_GROUPS[0].key;
export const TOTAL_FORMS = 358;
