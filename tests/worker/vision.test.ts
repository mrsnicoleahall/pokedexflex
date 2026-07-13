import { describe, it, expect } from "vitest";
import { parseRecognition } from "../../src/worker/import/vision";

describe("parseRecognition", () => {
  it("extracts a JSON array wrapped in a ```json code fence", () => {
    const text = '```json\n[{"name":"Charizard","shiny":true},{"name":"pikachu"}]\n```';
    expect(parseRecognition(text)).toEqual([
      { speciesName: "charizard", shiny: true },
      { speciesName: "pikachu", shiny: false },
    ]);
  });

  it("parses a bare array with no code fences", () => {
    const text = '[{"name":"Bulbasaur","shiny":false},{"name":"Squirtle","shiny":true}]';
    expect(parseRecognition(text)).toEqual([
      { speciesName: "bulbasaur", shiny: false },
      { speciesName: "squirtle", shiny: true },
    ]);
  });

  it("extracts the array even when surrounded by prose", () => {
    const text =
      'Sure, here is the list you asked for:\n[{"name":"Eevee","shiny":true}]\nLet me know if you need anything else!';
    expect(parseRecognition(text)).toEqual([{ speciesName: "eevee", shiny: true }]);
  });

  it("tolerates a trailing comma before the closing bracket", () => {
    const text = '[{"name":"Ditto","shiny":true},]';
    expect(parseRecognition(text)).toEqual([{ speciesName: "ditto", shiny: true }]);
  });

  it("skips entries without a name", () => {
    const text = '[{"shiny":true},{"name":"Snorlax"}]';
    expect(parseRecognition(text)).toEqual([{ speciesName: "snorlax", shiny: false }]);
  });

  it("returns [] for unparseable text with no array", () => {
    expect(parseRecognition("I don't see any Pokémon in this image.")).toEqual([]);
  });

  it("returns [] for malformed JSON inside brackets", () => {
    expect(parseRecognition("[{name: Pikachu, shiny: true}]")).toEqual([]);
  });

  it("returns [] for an empty string", () => {
    expect(parseRecognition("")).toEqual([]);
  });
});
