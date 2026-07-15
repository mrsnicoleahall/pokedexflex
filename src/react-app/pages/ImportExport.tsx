// src/react-app/pages/ImportExport.tsx
//
// "Import / Export" view: the signed-in user's bulk collection tools.
// Signed-out visitors get the same friendly sign-in prompt used by
// MyCollection instead of a crash or a blank page.
//
// Import: pick a .csv/.json file (via a click-or-drop dropzone) or paste raw
// content into a textarea; a format toggle picks the interpretation for
// pasted text (a dropped/selected file's extension overrides it). Every
// change debounces a call to `POST /api/import/preview`, which is the sole
// source of truth for validation. For CSV, the server's suggested column
// mapping seeds an editable per-header <select> grid; changing a mapping
// re-previews. A small client-side CSV/JSON reader (display-only, never
// authoritative) pulls the species/nickname/level text for each row so the
// preview table reads like real data instead of just numbered pass/fail rows.
// "Import N Pokémon" commits, shows a success/skip summary, and clears the
// form so a second import can start fresh.
//
// Export: one button downloads the whole collection as
// `pokedexflex-collection.json` via a Blob + temporary anchor — no server
// redirect needed.

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
	AuthRequiredError,
	exportCollection,
	fetchSpeciesById,
	importCommit,
	importPreview,
	photoPreview,
	savePreview,
	UnsupportedSaveError,
	VisionUnavailableError,
	type FieldMapping,
	type ImportFormat,
	type ImportParams,
	type ImportPreviewResponse,
	type ImportRowResult,
} from "../api";
import { useAuth } from "../auth/AuthProvider";
import { SignInPanel } from "../components/SignInPanel";
import { spriteUrl } from "../theme";

/** Specimen field keys a CSV column can be mapped onto (mirrors `src/worker/import/map.ts`'s recognized keys). */
const FIELD_OPTIONS: { value: string; label: string }[] = [
	{ value: "species", label: "Species" },
	{ value: "formId", label: "Form" },
	{ value: "nickname", label: "Nickname" },
	{ value: "level", label: "Level" },
	{ value: "isShiny", label: "Shiny" },
	{ value: "gender", label: "Gender" },
	{ value: "nature", label: "Nature" },
	{ value: "ability", label: "Ability" },
	{ value: "heldItem", label: "Held item" },
	{ value: "ball", label: "Ball" },
	{ value: "otName", label: "OT name" },
	{ value: "otId", label: "OT id" },
	{ value: "metLocation", label: "Met location" },
	{ value: "metDate", label: "Met date" },
	{ value: "originGame", label: "Origin game" },
	{ value: "originEra", label: "Origin era" },
	{ value: "isEvent", label: "Is event" },
	{ value: "eventName", label: "Event name" },
	{ value: "notes", label: "Notes" },
	{ value: "boxId", label: "Box id" },
	{ value: "moves", label: "Moves" },
	{ value: "ribbons", label: "Ribbons" },
	{ value: "ivs.hp", label: "IV HP" },
	{ value: "ivs.atk", label: "IV Attack" },
	{ value: "ivs.def", label: "IV Defense" },
	{ value: "ivs.spa", label: "IV Sp. Atk" },
	{ value: "ivs.spd", label: "IV Sp. Def" },
	{ value: "ivs.spe", label: "IV Speed" },
	{ value: "evs.hp", label: "EV HP" },
	{ value: "evs.atk", label: "EV Attack" },
	{ value: "evs.def", label: "EV Defense" },
	{ value: "evs.spa", label: "EV Sp. Atk" },
	{ value: "evs.spd", label: "EV Sp. Def" },
	{ value: "evs.spe", label: "EV Speed" },
];

/** Rows beyond this count are validated (server-side) but not individually rendered — keeps a huge import scrollable, not endless. */
const PREVIEW_DISPLAY_LIMIT = 25;

/** Message extraction shared by every async action below: a session-expiry hint for 401s, else the error's own message. */
function describeError(err: unknown): string {
	if (err instanceof AuthRequiredError) return "Your session expired — please sign in again.";
	return err instanceof Error ? err.message : String(err);
}

/**
 * Minimal quote-aware CSV splitter used only to render human-readable
 * preview cells (species/nickname/level). It intentionally mirrors the
 * server's `parseCsv` shape but is not the validation path — `importPreview`
 * remains the sole source of truth for which rows are valid.
 */
function splitCsvForPreview(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
		} else if (ch === ",") {
			row.push(field);
			field = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			field = "";
			rows.push(row);
			row = [];
		} else {
			field += ch;
		}
	}
	if (field !== "" || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

type DisplayRow = { species: string; nickname: string; level: string };

/** Pulls species/nickname/level text per row from the raw CSV, using the current mapping to find the right columns — for display only. */
function csvDisplayRows(content: string, mapping: FieldMapping | null): DisplayRow[] {
	const table = splitCsvForPreview(content);
	const headers = table[0] ?? [];
	const dataRows = table.slice(1);
	const headerFor = (field: string): string | undefined =>
		mapping ? Object.keys(mapping).find((h) => mapping[h] === field) : undefined;
	const speciesIndex = headers.indexOf(headerFor("species") ?? "\0");
	const nicknameIndex = headers.indexOf(headerFor("nickname") ?? "\0");
	const levelIndex = headers.indexOf(headerFor("level") ?? "\0");
	return dataRows.map((row) => ({
		species: speciesIndex >= 0 ? row[speciesIndex] ?? "" : "",
		nickname: nicknameIndex >= 0 ? row[nicknameIndex] ?? "" : "",
		level: levelIndex >= 0 ? row[levelIndex] ?? "" : "",
	}));
}

/** Pulls species/nickname/level text per row from the raw JSON (a bare array or `{ specimens: [...] }`) — for display only. */
function jsonDisplayRows(content: string): DisplayRow[] {
	try {
		const parsed = JSON.parse(content) as unknown;
		const specimensField =
			typeof parsed === "object" && parsed !== null
				? (parsed as { specimens?: unknown }).specimens
				: undefined;
		const arr = Array.isArray(parsed) ? parsed : Array.isArray(specimensField) ? specimensField : [];
		return arr.map((item): DisplayRow => {
			if (typeof item !== "object" || item === null) return { species: "", nickname: "", level: "" };
			const obj = item as Record<string, unknown>;
			const speciesRaw = obj.speciesName ?? obj.species ?? obj.speciesId ?? obj.dex;
			return {
				species: speciesRaw === undefined || speciesRaw === null ? "" : String(speciesRaw),
				nickname: obj.nickname != null ? String(obj.nickname) : "",
				level: obj.level != null ? String(obj.level) : "",
			};
		});
	} catch {
		return [];
	}
}

/** The bits of a photo-preview row's `input` this page actually needs — narrowed from `unknown`. */
type PhotoRowInput = { speciesId: number; isShiny: boolean };

/** Narrows a photo-preview row's `input` (typed `unknown` on the wire) down to `{ speciesId, isShiny }`, or `null` if it doesn't look like one (i.e. the row failed validation). */
function asPhotoRowInput(input: unknown): PhotoRowInput | null {
	if (typeof input !== "object" || input === null) return null;
	const obj = input as Record<string, unknown>;
	if (typeof obj.speciesId !== "number") return null;
	return { speciesId: obj.speciesId, isShiny: obj.isShiny === true };
}

/** The bits of a save-preview row's `input` this page actually needs — narrowed from `unknown`. */
type SaveRowInput = { speciesId: number; isShiny: boolean; level: number | null };

/** Narrows a save-preview row's `input` down to `{ speciesId, isShiny, level }`, or `null` if it doesn't look like one (i.e. the row failed validation). */
function asSaveRowInput(input: unknown): SaveRowInput | null {
	if (typeof input !== "object" || input === null) return null;
	const obj = input as Record<string, unknown>;
	if (typeof obj.speciesId !== "number") return null;
	return {
		speciesId: obj.speciesId,
		isShiny: obj.isShiny === true,
		level: typeof obj.level === "number" ? obj.level : null,
	};
}

/** A resolved species' display bits, cached by id so a batch of rows with repeats only fetches each species once. */
type SpeciesLookup = { name: string; homeId: number | null };

/**
 * Fetches (and caches) `{name, homeId}` for every distinct species id a batch of preview rows
 * references, using `extractSpeciesId` to pull that id out of each row's (typed `unknown`)
 * `input`. Best-effort: a species that fails to resolve is simply omitted, and the row falls
 * back to showing its error text.
 */
async function resolveSpeciesLookups(
	rows: ImportRowResult[],
	extractSpeciesId: (input: unknown) => number | null,
): Promise<Map<number, SpeciesLookup>> {
	const ids = new Set<number>();
	for (const row of rows) {
		const id = extractSpeciesId(row.input);
		if (id !== null) ids.add(id);
	}
	const map = new Map<number, SpeciesLookup>();
	await Promise.all(
		[...ids].map(async (id) => {
			try {
				const s = await fetchSpeciesById(id);
				map.set(id, { name: s.name, homeId: s.homeId });
			} catch {
				// Best-effort: leave unresolved, row shows its error text instead.
			}
		}),
	);
	return map;
}

export function ImportExport() {
	const { user, loading: authLoading } = useAuth();
	const [signInOpen, setSignInOpen] = useState(false);

	const [format, setFormat] = useState<ImportFormat>("csv");
	const [content, setContent] = useState("");
	// The picked/dropped File, when the current import came from a file rather than the paste
	// box. Kept alongside `content` (still read locally for the preview table's species/
	// nickname/level display) so preview/commit requests can send it as `multipart/form-data`
	// instead of embedding its bytes in a JSON body — large files (multi-MB) blow past the
	// server's JSON body-size limit that way.
	const [file, setFile] = useState<File | null>(null);
	const [fileName, setFileName] = useState<string | null>(null);
	const [mapping, setMapping] = useState<FieldMapping | null>(null);

	const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [previewError, setPreviewError] = useState<string | null>(null);

	const [committing, setCommitting] = useState(false);
	const [commitResult, setCommitResult] = useState<{ created: number; skipped: number } | null>(null);
	const [commitError, setCommitError] = useState<string | null>(null);

	const [exporting, setExporting] = useState(false);
	const [exportError, setExportError] = useState<string | null>(null);
	const [exportCount, setExportCount] = useState<number | null>(null);

	const [photoFileName, setPhotoFileName] = useState<string | null>(null);
	const [photoLoading, setPhotoLoading] = useState(false);
	const [photoError, setPhotoError] = useState<string | null>(null);
	const [photoVisionUnavailable, setPhotoVisionUnavailable] = useState(false);
	const [photoResult, setPhotoResult] = useState<ImportPreviewResponse | null>(null);
	const [photoChecked, setPhotoChecked] = useState<boolean[]>([]);
	const [photoSpecies, setPhotoSpecies] = useState<Map<number, SpeciesLookup>>(new Map());

	const [photoCommitting, setPhotoCommitting] = useState(false);
	const [photoCommitResult, setPhotoCommitResult] = useState<{ created: number; skipped: number } | null>(null);
	const [photoCommitError, setPhotoCommitError] = useState<string | null>(null);

	const [saveFileName, setSaveFileName] = useState<string | null>(null);
	const [saveLoading, setSaveLoading] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveUnsupported, setSaveUnsupported] = useState(false);
	const [saveResult, setSaveResult] = useState<ImportPreviewResponse | null>(null);
	const [saveChecked, setSaveChecked] = useState<boolean[]>([]);
	const [saveSpecies, setSaveSpecies] = useState<Map<number, SpeciesLookup>>(new Map());

	const [saveCommitting, setSaveCommitting] = useState(false);
	const [saveCommitResult, setSaveCommitResult] = useState<{ created: number; skipped: number } | null>(null);
	const [saveCommitError, setSaveCommitError] = useState<string | null>(null);

	// Builds the shared `{format, content|file, mapping?}` params for a preview/commit
	// request: the picked file when one is loaded (sent as multipart), else the pasted
	// `content` text (sent as JSON) — see the `file` state comment above.
	function currentImportParams(): ImportParams {
		const previewMapping = format === "csv" ? mapping ?? undefined : undefined;
		if (file) return { format, file, mapping: previewMapping };
		return { format, content, mapping: previewMapping };
	}

	// Debounced preview: fires whenever the content, file, format, or mapping changes.
	// A CSV's first preview omits `mapping` so the server auto-detects one; once
	// that suggestion comes back it seeds local state (only while `mapping` is
	// still null, so it never clobbers a user's own edits).
	useEffect(() => {
		if (!file && !content.trim()) {
			setPreview(null);
			setPreviewError(null);
			return;
		}
		let cancelled = false;
		setPreviewLoading(true);
		const t = setTimeout(() => {
			importPreview(currentImportParams())
				.then((r) => {
					if (cancelled) return;
					setPreview(r);
					setPreviewError(null);
					if (format === "csv" && mapping === null && r.suggestedMapping) {
						setMapping(r.suggestedMapping);
					}
				})
				.catch((err: unknown) => {
					if (cancelled) return;
					setPreview(null);
					setPreviewError(describeError(err));
				})
				.finally(() => {
					if (cancelled) return;
					setPreviewLoading(false);
				});
		}, 300);
		return () => {
			cancelled = true;
			clearTimeout(t);
		};
	}, [format, content, file, mapping]);

	const displayRows = useMemo<DisplayRow[]>(() => {
		if (!preview) return [];
		return format === "csv" ? csvDisplayRows(content, mapping) : jsonDisplayRows(content);
	}, [preview, format, content, mapping]);

	async function loadFile(picked: File) {
		// Read the text locally for the preview table's species/nickname/level display only —
		// the network request sends `picked` itself (multipart), not this string.
		const text = await picked.text();
		const detected: ImportFormat = picked.name.toLowerCase().endsWith(".json") ? "json" : "csv";
		setFormat(detected);
		setContent(text);
		setFile(picked);
		setMapping(null);
		setFileName(picked.name);
		setCommitResult(null);
		setCommitError(null);
	}

	function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (file) void loadFile(file);
	}

	function handleDrop(e: DragEvent<HTMLDivElement>) {
		e.preventDefault();
		const file = e.dataTransfer.files?.[0];
		if (file) void loadFile(file);
	}

	function handlePasteChange(value: string) {
		setContent(value);
		setFile(null);
		setMapping(null);
		setFileName(null);
		setCommitResult(null);
		setCommitError(null);
	}

	function handleFormatChange(next: ImportFormat) {
		if (next === format) return;
		setFormat(next);
		setMapping(null);
		setCommitResult(null);
		setCommitError(null);
	}

	function handleMappingChange(header: string, fieldKey: string | null) {
		setMapping((prev) => ({ ...(prev ?? preview?.suggestedMapping ?? {}), [header]: fieldKey }));
	}

	async function handleCommit() {
		if (!preview || preview.validCount === 0) return;
		setCommitError(null);
		setCommitting(true);
		try {
			const result = await importCommit(currentImportParams());
			setCommitResult(result);
			setContent("");
			setFile(null);
			setMapping(null);
			setPreview(null);
			setFileName(null);
		} catch (err) {
			setCommitResult(null);
			setCommitError(describeError(err));
		} finally {
			setCommitting(false);
		}
	}

	async function handleExport() {
		setExportError(null);
		setExporting(true);
		try {
			const data = await exportCollection();
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "pokedexflex-collection.json";
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			setExportCount(data.count);
		} catch (err) {
			setExportError(describeError(err));
		} finally {
			setExporting(false);
		}
	}

	async function handlePhotoFileInput(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;

		setPhotoFileName(file.name);
		setPhotoError(null);
		setPhotoVisionUnavailable(false);
		setPhotoResult(null);
		setPhotoChecked([]);
		setPhotoSpecies(new Map());
		setPhotoCommitResult(null);
		setPhotoCommitError(null);
		setPhotoLoading(true);
		try {
			const result = await photoPreview(file);
			setPhotoResult(result);
			setPhotoChecked(result.rows.map((row) => row.input !== null));
			resolveSpeciesLookups(result.rows, (input) => asPhotoRowInput(input)?.speciesId ?? null)
				.then(setPhotoSpecies)
				.catch(() => undefined);
		} catch (err) {
			if (err instanceof VisionUnavailableError) {
				setPhotoVisionUnavailable(true);
			} else {
				setPhotoError(describeError(err));
			}
		} finally {
			setPhotoLoading(false);
		}
	}

	function togglePhotoRow(index: number) {
		setPhotoChecked((prev) => prev.map((checked, i) => (i === index ? !checked : checked)));
	}

	async function handlePhotoCommit() {
		if (!photoResult) return;
		const confirmed = photoResult.rows
			.filter((row, i) => photoChecked[i] && row.input !== null)
			.map((row) => row.input);
		if (confirmed.length === 0) return;

		setPhotoCommitError(null);
		setPhotoCommitting(true);
		try {
			const result = await importCommit({ format: "json", content: JSON.stringify(confirmed) });
			setPhotoCommitResult(result);
			setPhotoResult(null);
			setPhotoChecked([]);
			setPhotoSpecies(new Map());
			setPhotoFileName(null);
		} catch (err) {
			setPhotoCommitError(describeError(err));
		} finally {
			setPhotoCommitting(false);
		}
	}

	async function handleSaveFileInput(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;

		setSaveFileName(file.name);
		setSaveError(null);
		setSaveUnsupported(false);
		setSaveResult(null);
		setSaveChecked([]);
		setSaveSpecies(new Map());
		setSaveCommitResult(null);
		setSaveCommitError(null);
		setSaveLoading(true);
		try {
			const result = await savePreview(file);
			setSaveResult(result);
			setSaveChecked(result.rows.map((row) => row.input !== null));
			resolveSpeciesLookups(result.rows, (input) => asSaveRowInput(input)?.speciesId ?? null)
				.then(setSaveSpecies)
				.catch(() => undefined);
		} catch (err) {
			if (err instanceof UnsupportedSaveError) {
				setSaveUnsupported(true);
			} else {
				setSaveError(describeError(err));
			}
		} finally {
			setSaveLoading(false);
		}
	}

	function toggleSaveRow(index: number) {
		setSaveChecked((prev) => prev.map((checked, i) => (i === index ? !checked : checked)));
	}

	async function handleSaveCommit() {
		if (!saveResult) return;
		const confirmed = saveResult.rows
			.filter((row, i) => saveChecked[i] && row.input !== null)
			.map((row) => row.input);
		if (confirmed.length === 0) return;

		setSaveCommitError(null);
		setSaveCommitting(true);
		try {
			const result = await importCommit({ format: "json", content: JSON.stringify(confirmed) });
			setSaveCommitResult(result);
			setSaveResult(null);
			setSaveChecked([]);
			setSaveSpecies(new Map());
			setSaveFileName(null);
		} catch (err) {
			setSaveCommitError(describeError(err));
		} finally {
			setSaveCommitting(false);
		}
	}

	if (authLoading) {
		return (
			<div className="container page">
				<div className="state">
					<span className="state__title">Loading…</span>
				</div>
			</div>
		);
	}

	if (!user) {
		return (
			<div className="container page">
				<div className="state">
					<p className="state__title">Sign in to import or export your collection</p>
					<p>Bring in specimens from a spreadsheet, or download a backup of everything you own.</p>
					<button type="button" className="button button--primary" onClick={() => setSignInOpen(true)}>
						Sign in
					</button>
				</div>
				{signInOpen && <SignInPanel onClose={() => setSignInOpen(false)} />}
			</div>
		);
	}

	const canCommit = Boolean(preview) && (preview?.validCount ?? 0) > 0 && !committing && !previewLoading;

	const photoCheckedCount = photoChecked.filter(Boolean).length;
	const canCommitPhoto = photoCheckedCount > 0 && !photoCommitting;

	const saveCheckedCount = saveChecked.filter(Boolean).length;
	const canCommitSave = saveCheckedCount > 0 && !saveCommitting;

	return (
		<div className="container page">
			<div className="page__meta">
				<h1 className="page__title">Import / Export</h1>
			</div>

			<section className="settings-section impexp-section">
				<h2 className="settings-section__title">Import</h2>
				<p className="settings-section__hint">
					Bring in specimens from a CSV (e.g. exported from a spreadsheet) or a PokeDexFlex JSON export.
				</p>

				<div className="tabs" role="tablist" aria-label="Import format">
					<button
						type="button"
						role="tab"
						className="tab"
						aria-selected={format === "csv"}
						onClick={() => handleFormatChange("csv")}
					>
						CSV
					</button>
					<button
						type="button"
						role="tab"
						className="tab"
						aria-selected={format === "json"}
						onClick={() => handleFormatChange("json")}
					>
						JSON
					</button>
				</div>

				<div className="import-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
					<label htmlFor="import-file" className="field-label">
						Upload a file
					</label>
					<input
						id="import-file"
						type="file"
						accept=".csv,.json"
						className="import-dropzone__input"
						onChange={handleFileInput}
					/>
					<p className="import-dropzone__hint">Drop a .csv or .json file here, or click to browse.</p>
					{fileName && <p className="import-dropzone__filename">Loaded: {fileName}</p>}
				</div>

				<div className="import-paste">
					<label htmlFor="import-paste" className="field-label">
						…or paste {format.toUpperCase()} content
					</label>
					<textarea
						id="import-paste"
						className="textarea input--full"
						rows={6}
						value={content}
						placeholder={
							format === "csv"
								? "Species,Nickname,Level,Shiny\ncharizard,Blaze,100,yes"
								: '[{"species":"charizard","nickname":"Blaze","level":100}]'
						}
						onChange={(e) => handlePasteChange(e.target.value)}
					/>
				</div>

				{previewError && (
					<p className="error-banner" role="alert">
						{previewError}
					</p>
				)}

				{!content.trim() && !previewLoading && (
					<p className="settings-section__hint">Choose or paste a file to see a preview before importing.</p>
				)}

				{previewLoading && !preview && <p className="settings-section__hint">Checking your file…</p>}

				{format === "csv" && preview?.headers && preview.headers.length > 0 && (
					<div className="import-mapping">
						<h3 className="settings-section__title">Column mapping</h3>
						<div className="import-mapping__grid">
							{preview.headers.map((header) => (
								<div key={header} className="import-mapping__row">
									<span className="import-mapping__header">{header}</span>
									<select
										className="select input--full"
										aria-label={`Map column "${header}"`}
										value={mapping?.[header] ?? ""}
										onChange={(e) =>
											handleMappingChange(header, e.target.value === "" ? null : e.target.value)
										}
									>
										<option value="">Ignore</option>
										{FIELD_OPTIONS.map((opt) => (
											<option key={opt.value} value={opt.value}>
												{opt.label}
											</option>
										))}
									</select>
								</div>
							))}
						</div>
					</div>
				)}

				{preview && preview.rows.length > 0 && (
					<div className="import-preview">
						<p className="import-preview__summary">
							<strong>{preview.validCount}</strong> valid · <strong>{preview.errorCount}</strong> will be
							skipped
						</p>
						<div className="import-preview__table-wrap">
							<table className="import-preview__table">
								<thead>
									<tr>
										<th scope="col">#</th>
										<th scope="col">Species</th>
										<th scope="col">Nickname</th>
										<th scope="col">Level</th>
										<th scope="col">Status</th>
									</tr>
								</thead>
								<tbody>
									{preview.rows.slice(0, PREVIEW_DISPLAY_LIMIT).map((row, i) => {
										const display = displayRows[i] ?? { species: "", nickname: "", level: "" };
										const valid = row.input !== null;
										return (
											<tr
												key={i}
												className={valid ? "import-preview__row--valid" : "import-preview__row--invalid"}
											>
												<td>{i + 1}</td>
												<td>{display.species || "—"}</td>
												<td>{display.nickname || "—"}</td>
												<td>{display.level || "—"}</td>
												<td>
													<span aria-hidden="true">{valid ? "✓" : "✗"}</span>
													<span className="visually-hidden">{valid ? "Valid" : "Invalid"}</span>
													{row.errors.length > 0 && (
														<span className="import-preview__errors">{row.errors.join("; ")}</span>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
						{preview.rows.length > PREVIEW_DISPLAY_LIMIT && (
							<p className="settings-section__hint">
								Showing first {PREVIEW_DISPLAY_LIMIT} of {preview.rows.length} previewed rows.
							</p>
						)}
					</div>
				)}

				{commitError && (
					<p className="error-banner" role="alert">
						{commitError}
					</p>
				)}
				{commitResult && (
					<p className="import-preview__summary" role="status">
						Added {commitResult.created} to your collection · {commitResult.skipped} skipped
					</p>
				)}

				<button type="button" className="button button--primary" disabled={!canCommit} onClick={handleCommit}>
					{committing ? "Importing…" : `Import ${preview?.validCount ?? 0} Pokémon`}
				</button>
			</section>

			<section className="settings-section impexp-section">
				<h2 className="settings-section__title">From a HOME / Scarlet·Violet screenshot</h2>
				<p className="settings-section__hint">
					Upload a box screenshot — we'll recognize the Pokémon for you to review before adding.
				</p>

				<div className="import-dropzone photo-dropzone">
					<label htmlFor="photo-import-file" className="field-label">
						Upload a screenshot
					</label>
					<input
						id="photo-import-file"
						type="file"
						accept="image/*"
						className="import-dropzone__input"
						onChange={handlePhotoFileInput}
					/>
					<p className="import-dropzone__hint">Click to choose a box screenshot (PNG or JPG).</p>
					{photoFileName && <p className="import-dropzone__filename">Loaded: {photoFileName}</p>}
				</div>

				{photoLoading && <p className="settings-section__hint">Recognizing Pokémon in your screenshot…</p>}

				{photoVisionUnavailable && (
					<p className="photo-import__unavailable" role="status">
						📷 Photo recognition activates once PokeDexFlex is deployed with the AI service. For now, use
						CSV/JSON import or add Pokémon manually.
					</p>
				)}

				{photoError && (
					<p className="error-banner" role="alert">
						{photoError}
					</p>
				)}

				{photoResult && photoResult.rows.length > 0 && (
					<div className="import-preview">
						<p className="import-preview__summary">
							<strong>{photoResult.validCount}</strong> recognized · <strong>{photoResult.errorCount}</strong>{" "}
							not matched
						</p>
						<div className="import-preview__table-wrap">
							<table className="import-preview__table">
								<thead>
									<tr>
										<th scope="col">
											<span className="visually-hidden">Include</span>
										</th>
										<th scope="col"></th>
										<th scope="col">Species</th>
										<th scope="col">Shiny</th>
									</tr>
								</thead>
								<tbody>
									{photoResult.rows.map((row, i) => {
										const parsed = asPhotoRowInput(row.input);
										const lookup = parsed ? photoSpecies.get(parsed.speciesId) : undefined;
										const valid = row.input !== null;
										return (
											<tr
												key={i}
												className={valid ? "import-preview__row--valid" : "import-preview__row--invalid"}
											>
												<td>
													<input
														type="checkbox"
														aria-label={
															lookup
																? `Include ${lookup.name}`
																: `Include row ${i + 1}`
														}
														checked={Boolean(photoChecked[i])}
														disabled={!valid}
														onChange={() => togglePhotoRow(i)}
													/>
												</td>
												<td>
													{lookup?.homeId != null && (
														<img
															className="photo-import__thumb"
															src={spriteUrl(lookup.homeId, parsed?.isShiny)}
															alt=""
															width={32}
															height={32}
															loading="lazy"
														/>
													)}
												</td>
												<td>
													{lookup?.name ?? (row.errors.length > 0 ? row.errors.join("; ") : "Unrecognized")}
												</td>
												<td>
													<span aria-hidden="true">{parsed?.isShiny ? "✨" : "—"}</span>
													<span className="visually-hidden">
														{parsed?.isShiny ? "Shiny" : "Not shiny"}
													</span>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</div>
				)}

				{photoCommitError && (
					<p className="error-banner" role="alert">
						{photoCommitError}
					</p>
				)}
				{photoCommitResult && (
					<p className="import-preview__summary" role="status">
						Added {photoCommitResult.created} to your collection · {photoCommitResult.skipped} skipped
					</p>
				)}

				{photoResult && photoResult.rows.length > 0 && (
					<button
						type="button"
						className="button button--primary"
						disabled={!canCommitPhoto}
						onClick={handlePhotoCommit}
					>
						{photoCommitting ? "Adding…" : `Add ${photoCheckedCount} Pokémon`}
					</button>
				)}
			</section>

			<section className="settings-section impexp-section">
				<h2 className="settings-section__title">From an Ultra Sun / Ultra Moon save file</h2>
				<p className="settings-section__hint">
					Gen 7 USUM only. Export your save with a homebrew tool (e.g. Checkpoint/JKSM). We'll read your
					boxes for you to review before adding.
				</p>
				<p className="settings-section__hint save-import__caveat">
					Save parsing is best-effort — double-check the results.
				</p>

				<div className="import-dropzone">
					<label htmlFor="save-import-file" className="field-label">
						Upload a save file
					</label>
					<input
						id="save-import-file"
						type="file"
						accept=".sav,.bin"
						className="import-dropzone__input"
						onChange={handleSaveFileInput}
					/>
					<p className="import-dropzone__hint">Click to choose a .sav or .bin file.</p>
					{saveFileName && <p className="import-dropzone__filename">Loaded: {saveFileName}</p>}
				</div>

				{saveLoading && <p className="settings-section__hint">Reading your save file…</p>}

				{saveUnsupported && (
					<p className="error-banner" role="alert">
						That doesn't look like an Ultra Sun / Ultra Moon save. Only USUM (Gen 7) saves are supported.
					</p>
				)}

				{saveError && (
					<p className="error-banner" role="alert">
						{saveError}
					</p>
				)}

				{saveResult && saveResult.rows.length > 0 && (
					<div className="import-preview">
						<p className="import-preview__summary">
							<strong>{saveResult.validCount}</strong> found · <strong>{saveResult.errorCount}</strong>{" "}
							skipped
						</p>
						<div className="import-preview__table-wrap">
							<table className="import-preview__table">
								<thead>
									<tr>
										<th scope="col">
											<span className="visually-hidden">Include</span>
										</th>
										<th scope="col"></th>
										<th scope="col">Species</th>
										<th scope="col">Level</th>
										<th scope="col">Shiny</th>
									</tr>
								</thead>
								<tbody>
									{saveResult.rows.map((row, i) => {
										const parsed = asSaveRowInput(row.input);
										const lookup = parsed ? saveSpecies.get(parsed.speciesId) : undefined;
										const valid = row.input !== null;
										return (
											<tr
												key={i}
												className={valid ? "import-preview__row--valid" : "import-preview__row--invalid"}
											>
												<td>
													<input
														type="checkbox"
														aria-label={lookup ? `Include ${lookup.name}` : `Include row ${i + 1}`}
														checked={Boolean(saveChecked[i])}
														disabled={!valid}
														onChange={() => toggleSaveRow(i)}
													/>
												</td>
												<td>
													{lookup?.homeId != null && (
														<img
															className="photo-import__thumb"
															src={spriteUrl(lookup.homeId, parsed?.isShiny)}
															alt=""
															width={32}
															height={32}
															loading="lazy"
														/>
													)}
												</td>
												<td>
													{lookup?.name ?? (row.errors.length > 0 ? row.errors.join("; ") : "Unrecognized")}
												</td>
												<td>{parsed?.level ?? "—"}</td>
												<td>
													<span aria-hidden="true">{parsed?.isShiny ? "✨" : "—"}</span>
													<span className="visually-hidden">{parsed?.isShiny ? "Shiny" : "Not shiny"}</span>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</div>
				)}

				{saveCommitError && (
					<p className="error-banner" role="alert">
						{saveCommitError}
					</p>
				)}
				{saveCommitResult && (
					<p className="import-preview__summary" role="status">
						Added {saveCommitResult.created} to your collection · {saveCommitResult.skipped} skipped
					</p>
				)}

				{saveResult && saveResult.rows.length > 0 && (
					<button
						type="button"
						className="button button--primary"
						disabled={!canCommitSave}
						onClick={handleSaveCommit}
					>
						{saveCommitting ? "Adding…" : `Add ${saveCheckedCount} Pokémon`}
					</button>
				)}
			</section>

			<section className="settings-section impexp-section">
				<h2 className="settings-section__title">Export</h2>
				<p className="settings-section__hint">
					Download your whole collection as JSON — handy as a backup, or to re-import elsewhere.
				</p>
				{exportError && (
					<p className="error-banner" role="alert">
						{exportError}
					</p>
				)}
				{exportCount !== null && !exportError && (
					<p className="settings-section__hint">Last export: {exportCount} specimens.</p>
				)}
				<button type="button" className="button button--primary" disabled={exporting} onClick={handleExport}>
					{exporting ? "Preparing…" : "Download my collection (JSON)"}
				</button>
			</section>
		</div>
	);
}
