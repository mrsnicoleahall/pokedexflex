/**
 * Pure USUM (Pokémon Ultra Sun / Ultra Moon, Gen 7, 3DS) save reader.
 *
 * No I/O, no Node APIs — `DataView`/`Uint8Array` only, safe for the
 * Cloudflare Workers runtime. Builds on Phase 6 Task 1's `decryptPk7`/
 * `parsePk7` (see src/worker/import/pk7.ts) to turn a raw USUM save
 * buffer into a flat list of `ParsedMon`.
 *
 * Offsets below are taken directly from PKHeX (kwsch/PKHeX, the de facto
 * reference implementation for these save formats), fetched from GitHub
 * during implementation:
 *
 * - `SaveUtil.SIZE_G7USUM = 0x6CC00` and `SaveUtil.SIZE_G7SM = 0x6BE00`
 *   (PKHeX.Core/Saves/Util/SaveUtil.cs) — USUM and Sun/Moon main saves
 *   are fixed, and *different*, sizes, so save size alone distinguishes
 *   them. PKHeX's own `IsG7USUM`/`IsG7SM` detectors gate on exactly this
 *   size plus a magic-footer check (see below) — no full version byte
 *   parse is needed.
 * - PKHeX also checks `HasSaveFooterBEEF`: the 4 bytes at
 *   `data.length - 0x1F0`, read as a little-endian u32, equal `0x42454546`
 *   ("BEEF"). This is present on Gen6/7 3DS "main" save files generally
 *   (X/Y, ORAS, SM, USUM) and is the cheap "version-byte-ish" secondary
 *   gate the brief asked for, without needing a real save fixture.
 * - `SaveBlockAccessor7USUM.BlockInfoUSUM[14]` ("BoxPokemon") has
 *   `Offset = 0x05200, Length = 0x36600` (PKHeX.Core/Saves/Access/
 *   SaveBlockAccessor7USUM.cs). `0x36600` bytes === 32 boxes * 30 slots *
 *   232 bytes/slot exactly (960 * 232 = 222720 = 0x36600), confirming the
 *   PC box region is one contiguous run of 232-byte stored PK7 slots
 *   starting at 0x05200, with no per-slot or per-box header.
 *
 * These offsets are believed correct for the retail USUM save format but
 * have only been exercised against a synthetic buffer here (no real
 * USUM .sav fixture was available) — see tests/worker/usum-save.test.ts.
 * Party parsing (block 4, `PokePartySave` @ 0x01600) is intentionally not
 * implemented: party slots are 260 bytes (232-byte PK7 body + 28 bytes of
 * unencrypted battle-stat fields, plus a 4-byte count header for the
 * block), a different shape than the box format this task covers, and
 * doing it without a real save to validate against risked getting the
 * stat-block layout wrong.
 */

import { decryptPk7, parsePk7, type ParsedMon } from "./pk7";

/** Thrown by `readUsumBoxes` when the input isn't a plausible USUM save. */
export class UnsupportedSaveError extends Error {}

const PK7_SIZE = 232;

/** PKHeX SaveUtil.SIZE_G7USUM. The only save size this reader accepts. */
const USUM_SAVE_SIZE = 0x6cc00;

/** Offset (from EOF) and expected magic for PKHeX's `HasSaveFooterBEEF` check. */
const FOOTER_MAGIC_OFFSET_FROM_END = 0x1f0;
const FOOTER_MAGIC = 0x42454546; // "BEEF", read little-endian

/** PKHeX SaveBlockAccessor7USUM.BlockInfoUSUM[14] ("BoxPokemon"): Offset. */
const BOX_OFFSET = 0x05200;
/** ... Length. 0x36600 === BOX_COUNT * SLOTS_PER_BOX * PK7_SIZE exactly. */
const BOX_REGION_LENGTH = 0x36600;

const BOX_COUNT = 32;
const SLOTS_PER_BOX = 30;
const TOTAL_SLOTS = BOX_COUNT * SLOTS_PER_BOX; // 960

/**
 * Best-effort validation that `bytes` is a USUM main save: exact save
 * size (`SIZE_G7USUM`, distinct from Sun/Moon's `SIZE_G7SM`) plus the
 * "BEEF" magic footer PKHeX also checks. Does not decode any Pokémon
 * data.
 */
export function isUsumSave(bytes: Uint8Array): boolean {
  if (bytes.length !== USUM_SAVE_SIZE) return false;

  const magicOffset = bytes.length - FOOTER_MAGIC_OFFSET_FROM_END;
  if (magicOffset < 0 || magicOffset + 4 > bytes.length) return false;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(magicOffset, true) === FOOTER_MAGIC;
}

/**
 * Decrypt and parse every non-empty PC box slot (32 boxes x 30 slots x
 * 232 bytes, contiguous at `BOX_OFFSET`) out of a USUM main save buffer.
 * Throws `UnsupportedSaveError` if `bytes` doesn't look like a USUM save.
 */
export function readUsumBoxes(bytes: Uint8Array): ParsedMon[] {
  if (!isUsumSave(bytes)) {
    throw new UnsupportedSaveError("readUsumBoxes: not a recognized USUM save (size/footer mismatch)");
  }

  const boxRegionEnd = BOX_OFFSET + BOX_REGION_LENGTH;
  if (boxRegionEnd > bytes.length) {
    // Should be unreachable given USUM_SAVE_SIZE, but guard defensively
    // against a future constant-tweak mistake rather than reading OOB.
    throw new UnsupportedSaveError("readUsumBoxes: box region exceeds buffer length");
  }

  const mons: ParsedMon[] = [];
  for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
    const offset = BOX_OFFSET + slot * PK7_SIZE;
    const stored = bytes.subarray(offset, offset + PK7_SIZE);
    const decrypted = decryptPk7(stored);
    const parsed = parsePk7(decrypted);
    if (parsed.species !== 0) {
      mons.push(parsed);
    }
  }
  return mons;
}
