import { describe, it, expect } from "vitest";
import { decryptPk7, encryptPk7, parsePk7 } from "../../src/worker/import/pk7";

const PK7_SIZE = 232;

/** Write a UTF-16LE string (no terminator needed — buffer starts zeroed). */
const writeUtf16 = (view: DataView, offset: number, text: string): void => {
  for (let i = 0; i < text.length; i++) {
    view.setUint16(offset + i * 2, text.charCodeAt(i), true);
  }
};

const packIvs = (ivs: { hp: number; atk: number; def: number; spe: number; spa: number; spd: number }): number =>
  (ivs.hp & 0x1f) |
  ((ivs.atk & 0x1f) << 5) |
  ((ivs.def & 0x1f) << 10) |
  ((ivs.spe & 0x1f) << 15) |
  ((ivs.spa & 0x1f) << 20) |
  ((ivs.spd & 0x1f) << 25);

type BuildOptions = {
  ec: number;
  species: number;
  tid: number;
  sid: number;
  pid: number;
  nickname?: string;
  move0?: number;
  ivs?: { hp: number; atk: number; def: number; spe: number; spa: number; spd: number };
};

/** Build a canonical (decrypted, unshuffled) 232-byte PK7 buffer with known fields. */
const buildDecrypted = (opts: BuildOptions): Uint8Array => {
  const buf = new Uint8Array(PK7_SIZE);
  const view = new DataView(buf.buffer);

  view.setUint32(0x00, opts.ec >>> 0, true); // EC
  view.setUint16(0x08, opts.species, true); // species
  view.setUint16(0x0c, opts.tid, true); // TID
  view.setUint16(0x0e, opts.sid, true); // SID
  view.setUint32(0x18, opts.pid >>> 0, true); // PID

  if (opts.nickname) {
    writeUtf16(view, 0x40, opts.nickname);
  }
  if (opts.move0 !== undefined) {
    view.setUint16(0x5a, opts.move0, true);
  }
  if (opts.ivs) {
    view.setUint32(0x74, packIvs(opts.ivs), true);
  }

  return buf;
};

const SHINY_IVS = { hp: 31, atk: 25, def: 20, spe: 15, spa: 10, spd: 5 };

describe("pk7 encrypt/decrypt round trip", () => {
  it("decryptPk7(encryptPk7(d)) deep-equals the original decrypted buffer (shiny case)", () => {
    const decrypted = buildDecrypted({
      ec: 0x12345678,
      species: 6,
      tid: 12345,
      sid: 54321,
      pid: 0xe4080000, // chosen so TID^SID^(PID_hi^PID_lo) === 0 -> shiny
      nickname: "Blaze",
      move0: 85,
      ivs: SHINY_IVS,
    });

    const encrypted = encryptPk7(decrypted);
    expect(encrypted.length).toBe(PK7_SIZE);
    // Sanity: encryption actually changed the block region (not a no-op).
    expect(encrypted).not.toEqual(decrypted);
    // Header (EC) must be unchanged/unencrypted.
    expect(encrypted.subarray(0, 8)).toEqual(decrypted.subarray(0, 8));

    const roundTripped = decryptPk7(encrypted);
    expect(roundTripped).toEqual(decrypted);
  });

  it("round-trips a non-shiny buffer too", () => {
    const decrypted = buildDecrypted({
      ec: 0xcafebabe,
      species: 25,
      tid: 1,
      sid: 2,
      pid: 0x87654321,
      nickname: "Sparky",
      move0: 1,
    });

    const roundTripped = decryptPk7(encryptPk7(decrypted));
    expect(roundTripped).toEqual(decrypted);
  });
});

describe("parsePk7", () => {
  it("parses species, nickname, shiny status, IVs, and moves from a shiny mon", () => {
    const decrypted = buildDecrypted({
      ec: 0x12345678,
      species: 6,
      tid: 12345,
      sid: 54321,
      pid: 0xe4080000,
      nickname: "Blaze",
      move0: 85,
      ivs: SHINY_IVS,
    });

    const parsed = parsePk7(decrypted);

    expect(parsed.species).toBe(6);
    expect(parsed.nickname).toBe("Blaze");
    expect(parsed.shiny).toBe(true);
    expect(parsed.ivs).toEqual(SHINY_IVS);
    expect(parsed.moves[0]).toBe(85);
    expect(parsed.otId).toBe("12345");
    expect(parsed.level).toBeNull();
  });

  it("reports shiny: false for a non-shiny PID", () => {
    const decrypted = buildDecrypted({
      ec: 0xcafebabe,
      species: 25,
      tid: 1,
      sid: 2,
      pid: 0x87654321,
    });

    const parsed = parsePk7(decrypted);
    expect(parsed.shiny).toBe(false);
  });

  it("returns species 0 for an all-zero (empty slot) buffer", () => {
    const empty = new Uint8Array(PK7_SIZE);
    const parsed = parsePk7(empty);

    expect(parsed.species).toBe(0);
    expect(parsed.nickname).toBeNull();
    expect(parsed.ivs).toBeNull();
    expect(parsed.evs).toBeNull();
    expect(parsed.moves).toEqual([]);
  });
});
