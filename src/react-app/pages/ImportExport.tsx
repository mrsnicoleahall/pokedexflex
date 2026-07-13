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
// `pokeflexdex-collection.json` via a Blob + temporary anchor — no server
// redirect needed.

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
	AuthRequiredError,
	exportCollection,
	importCommit,
	importPreview,
	type FieldMapping,
	type ImportFormat,
	type ImportPreviewResponse,
} from "../api";
import { useAuth } from "../auth/AuthProvider";
import { SignInPanel } from "../components/SignInPanel";

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

export function ImportExport() {
	const { user, loading: authLoading } = useAuth();
	const [signInOpen, setSignInOpen] = useState(false);

	const [format, setFormat] = useState<ImportFormat>("csv");
	const [content, setContent] = useState("");
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

	// Debounced preview: fires whenever the content, format, or mapping changes.
	// A CSV's first preview omits `mapping` so the server auto-detects one; once
	// that suggestion comes back it seeds local state (only while `mapping` is
	// still null, so it never clobbers a user's own edits).
	useEffect(() => {
		if (!content.trim()) {
			setPreview(null);
			setPreviewError(null);
			return;
		}
		let cancelled = false;
		setPreviewLoading(true);
		const t = setTimeout(() => {
			importPreview({ format, content, mapping: format === "csv" ? mapping ?? undefined : undefined })
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
	}, [format, content, mapping]);

	const displayRows = useMemo<DisplayRow[]>(() => {
		if (!preview) return [];
		return format === "csv" ? csvDisplayRows(content, mapping) : jsonDisplayRows(content);
	}, [preview, format, content, mapping]);

	async function loadFile(file: File) {
		const text = await file.text();
		const detected: ImportFormat = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
		setFormat(detected);
		setContent(text);
		setMapping(null);
		setFileName(file.name);
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
			const result = await importCommit({
				format,
				content,
				mapping: format === "csv" ? mapping ?? undefined : undefined,
			});
			setCommitResult(result);
			setContent("");
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
			a.download = "pokeflexdex-collection.json";
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

	return (
		<div className="container page">
			<div className="page__meta">
				<h1 className="page__title">Import / Export</h1>
			</div>

			<section className="settings-section impexp-section">
				<h2 className="settings-section__title">Import</h2>
				<p className="settings-section__hint">
					Bring in specimens from a CSV (e.g. exported from a spreadsheet) or a PokeFlexDex JSON export.
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
