import { describe, it, expect } from "vitest";
import { encryptPk7 } from "../../src/worker/import/pk7";
import { isUsumSave, readUsumBoxes, UnsupportedSaveError } from "../../src/worker/import/usum-save";

const PK7_SIZE = 232;
const USUM_SAVE_SIZE = 0x6cc00;
const BOX_OFFSET = 0x05200;
const FOOTER_MAGIC_OFFSET_FROM_END = 0x1f0;
const FOOTER_MAGIC = 0x42454546; // "BEEF"

/** Build a canonical (decrypted, unshuffled) 232-byte PK7 buffer with just a species + EC. */
const buildDecrypted = (ec: number, species: number): Uint8Array => {
  const buf = new Uint8Array(PK7_SIZE);
  const view = new DataView(buf.buffer);
  view.setUint32(0x00, ec >>> 0, true); // EC
  view.setUint16(0x08, species, true); // species
  return buf;
};

/** Build a zeroed synthetic USUM save buffer with the BEEF footer magic PKHeX also checks. */
const buildSyntheticUsumSave = (): Uint8Array => {
  const buf = new Uint8Array(USUM_SAVE_SIZE);
  const view = new DataView(buf.buffer);
  view.setUint32(USUM_SAVE_SIZE - FOOTER_MAGIC_OFFSET_FROM_END, FOOTER_MAGIC, true);
  return buf;
};

describe("isUsumSave", () => {
  it("accepts a buffer of the exact USUM save size with the BEEF footer magic", () => {
    expect(isUsumSave(buildSyntheticUsumSave())).toBe(true);
  });

  it("rejects a wrong-size buffer", () => {
    expect(isUsumSave(new Uint8Array(1000))).toBe(false);
  });

  it("rejects a Sun/Moon-sized buffer (0x6BE00) even with the footer magic", () => {
    const buf = new Uint8Array(0x6be00);
    new DataView(buf.buffer).setUint32(buf.length - FOOTER_MAGIC_OFFSET_FROM_END, FOOTER_MAGIC, true);
    expect(isUsumSave(buf)).toBe(false);
  });

  it("rejects a correctly-sized buffer missing the footer magic", () => {
    expect(isUsumSave(new Uint8Array(USUM_SAVE_SIZE))).toBe(false);
  });
});

describe("readUsumBoxes", () => {
  it("throws UnsupportedSaveError for a wrong-size buffer", () => {
    expect(() => readUsumBoxes(new Uint8Array(1000))).toThrow(UnsupportedSaveError);
  });

  it("decrypts and parses two placed mons, skipping empty slots", () => {
    const save = buildSyntheticUsumSave();

    const charmander = encryptPk7(buildDecrypted(0x12345678, 6));
    const pikachu = encryptPk7(buildDecrypted(0xcafebabe, 25));

    // Slot 0 (box 0, slot 0) and slot 1 (box 0, slot 1); the rest of the
    // 32*30-slot box region stays all-zero (empty, species 0).
    save.set(charmander, BOX_OFFSET);
    save.set(pikachu, BOX_OFFSET + PK7_SIZE);

    const mons = readUsumBoxes(save);

    expect(mons).toHaveLength(2);
    expect(mons.map((m) => m.species)).toEqual([6, 25]);
  });

  it("returns an empty array when every box slot is empty", () => {
    expect(readUsumBoxes(buildSyntheticUsumSave())).toEqual([]);
  });
});
