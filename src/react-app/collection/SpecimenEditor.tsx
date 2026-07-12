// src/react-app/collection/SpecimenEditor.tsx
//
// Modal specimen editor used for both "add to collection" (create, prefilled
// from a species/event card) and "edit specimen" (from a My Collection
// card). Renders grouped fieldsets — Identity, Stats, Moves, Origin/Event,
// Ribbons, Storage & notes — with client-side bound checks that mirror the
// server's `validateSpecimen` (IV 0-31, EV 0-252 & sum <=510, level 1-100,
// <=4 moves) so users get instant feedback; the server stays the source of
// truth and its `{ errors }` body is surfaced verbatim on a 400.
//
// In edit mode the editor fetches the full specimen (`getSpecimen`) and,
// when the caller didn't already supply the species' form list, the species
// itself (`fetchSpeciesById`) to populate the form <select>. In create mode
// the caller (a species/event card, or the species picker) supplies
// `initial` with at least `speciesId`; missing species metadata (name, home
// id, forms) is filled in the same way.

import { useEffect, useMemo, useRef, useState } from "react";
import {
	ApiValidationError,
	AuthRequiredError,
	createBox,
	createSpecimen,
	deleteSpecimen,
	fetchSpeciesById,
	getSpecimen,
	listBoxes,
	updateSpecimen,
	type BoxDto,
	type FormDto,
	type SpecimenInput,
	type StatBlock,
} from "../api";
import { Sprite } from "../components/Sprite";
import { formatDexNumber, formatName } from "../theme";

export type SpecimenEditorInitial = Partial<SpecimenInput> & {
	speciesId: number;
	speciesName?: string;
	homeId?: number | null;
	forms?: FormDto[];
};

type SpecimenEditorProps = {
	mode: "create" | "edit";
	/** Required in create mode (at least `speciesId`); ignored in edit mode. */
	initial?: SpecimenEditorInitial;
	/** Required in edit mode. */
	specimenId?: string;
	onSaved: () => void;
	onClose: () => void;
};

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
type StatKey = (typeof STAT_KEYS)[number];
const STAT_LABELS: Record<StatKey, string> = {
	hp: "HP",
	atk: "Atk",
	def: "Def",
	spa: "SpA",
	spd: "SpD",
	spe: "Spe",
};
type StatStrings = Record<StatKey, string>;
const emptyStats = (): StatStrings => ({ hp: "", atk: "", def: "", spa: "", spd: "", spe: "" });

const statBlockToStrings = (block: StatBlock | null | undefined): StatStrings => {
	if (!block) return emptyStats();
	const out = emptyStats();
	for (const k of STAT_KEYS) out[k] = String(block[k]);
	return out;
};

const statsToBlock = (s: StatStrings): StatBlock => {
	const out = {} as StatBlock;
	for (const k of STAT_KEYS) {
		const n = Number(s[k]);
		out[k] = s[k].trim() === "" || !Number.isFinite(n) ? 0 : n;
	}
	return out;
};

const GENDER_OPTIONS: { value: string; label: string }[] = [
	{ value: "", label: "—" },
	{ value: "male", label: "Male" },
	{ value: "female", label: "Female" },
	{ value: "genderless", label: "Genderless" },
];

const NEW_BOX_VALUE = "__new__";

type SpeciesInfo = {
	id: number;
	name: string;
	homeId: number | null;
	forms: FormDto[];
};

export function SpecimenEditor({ mode, initial, specimenId, onSaved, onClose }: SpecimenEditorProps) {
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [speciesInfo, setSpeciesInfo] = useState<SpeciesInfo | null>(null);

	const [formId, setFormId] = useState<number | null>(null);
	const [nickname, setNickname] = useState("");
	const [level, setLevel] = useState("");
	const [isShiny, setIsShiny] = useState(false);
	const [gender, setGender] = useState("");
	const [nature, setNature] = useState("");
	const [ability, setAbility] = useState("");
	const [heldItem, setHeldItem] = useState("");
	const [ball, setBall] = useState("");
	const [ivs, setIvs] = useState<StatStrings>(emptyStats());
	const [evs, setEvs] = useState<StatStrings>(emptyStats());
	const [moves, setMoves] = useState<string[]>(["", "", "", ""]);
	const [otName, setOtName] = useState("");
	const [otId, setOtId] = useState("");
	const [metLocation, setMetLocation] = useState("");
	const [metDate, setMetDate] = useState("");
	const [originGame, setOriginGame] = useState("");
	const [originEra, setOriginEra] = useState("");
	const [isEvent, setIsEvent] = useState(false);
	const [eventName, setEventName] = useState("");
	const [ribbons, setRibbons] = useState<string[]>([]);
	const [ribbonDraft, setRibbonDraft] = useState("");
	const [boxId, setBoxId] = useState<string | null>(null);
	const [notes, setNotes] = useState("");

	const [boxes, setBoxes] = useState<BoxDto[]>([]);
	const [saving, setSaving] = useState(false);
	const [serverErrors, setServerErrors] = useState<string[]>([]);
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [deleteConfirmText, setDeleteConfirmText] = useState("");
	const [deleting, setDeleting] = useState(false);

	const firstFieldRef = useRef<HTMLSelectElement>(null);

	// Esc closes the editor, like the sign-in modal.
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	// Fetch the user's boxes for the storage <select>.
	useEffect(() => {
		let cancelled = false;
		listBoxes()
			.then((r) => {
				if (!cancelled) setBoxes(r.boxes);
			})
			.catch(() => {
				/* the box list is just a convenience — a failure here shouldn't block editing */
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// Load the specimen (edit mode) and/or species metadata, then seed all field state.
	useEffect(() => {
		let cancelled = false;

		function applySource(source: Partial<SpecimenInput> | undefined) {
			setFormId(source?.formId ?? null);
			setNickname(source?.nickname ?? "");
			setLevel(source?.level != null ? String(source.level) : "");
			setIsShiny(Boolean(source?.isShiny));
			setGender(source?.gender ?? "");
			setNature(source?.nature ?? "");
			setAbility(source?.ability ?? "");
			setHeldItem(source?.heldItem ?? "");
			setBall(source?.ball ?? "");
			setIvs(statBlockToStrings(source?.ivs));
			setEvs(statBlockToStrings(source?.evs));
			const srcMoves = source?.moves ?? [];
			setMoves([0, 1, 2, 3].map((i) => srcMoves[i] ?? ""));
			setOtName(source?.otName ?? "");
			setOtId(source?.otId ?? "");
			setMetLocation(source?.metLocation ?? "");
			setMetDate(source?.metDate ?? "");
			setOriginGame(source?.originGame ?? "");
			setOriginEra(source?.originEra ?? "");
			setIsEvent(Boolean(source?.isEvent));
			setEventName(source?.eventName ?? "");
			setRibbons(source?.ribbons ?? []);
			setBoxId(source?.boxId ?? null);
			setNotes(source?.notes ?? "");
		}

		async function load() {
			setLoading(true);
			setLoadError(null);
			try {
				let speciesId: number;
				let speciesName: string | undefined;
				let homeId: number | null | undefined;
				let forms: FormDto[] | undefined;
				let source: Partial<SpecimenInput>;

				if (mode === "edit") {
					if (!specimenId) throw new Error("Missing specimenId for edit");
					const specimen = await getSpecimen(specimenId);
					if (cancelled) return;
					speciesId = specimen.speciesId;
					speciesName = specimen.speciesName;
					homeId = specimen.homeId;
					source = specimen;
				} else {
					if (!initial) throw new Error("Missing species to add");
					speciesId = initial.speciesId;
					speciesName = initial.speciesName;
					homeId = initial.homeId;
					forms = initial.forms;
					source = initial;
				}

				if (!forms || !speciesName || homeId === undefined) {
					const sp = await fetchSpeciesById(speciesId);
					if (cancelled) return;
					speciesName = speciesName ?? sp.name;
					homeId = homeId ?? sp.homeId;
					forms = forms ?? sp.forms;
				}

				if (cancelled) return;
				setSpeciesInfo({ id: speciesId, name: speciesName ?? "", homeId: homeId ?? null, forms: forms ?? [] });
				applySource(source);
				setLoading(false);
			} catch (err) {
				if (cancelled) return;
				setLoadError(
					err instanceof AuthRequiredError
						? "Your session expired — please sign in again."
						: err instanceof Error
							? err.message
							: String(err),
				);
				setLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
		// `initial` is only consulted on the initial load for a given mode/specimenId; callers give
		// this component a fresh `key` when the target specimen/species changes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mode, specimenId]);

	useEffect(() => {
		if (!loading) firstFieldRef.current?.focus();
	}, [loading]);

	const evSum = useMemo(() => STAT_KEYS.reduce((sum, k) => sum + (Number(evs[k]) || 0), 0), [evs]);

	const clientErrors = useMemo(() => {
		const errs: string[] = [];
		if (level.trim() !== "") {
			const n = Number(level);
			if (!Number.isInteger(n) || n < 1 || n > 100) errs.push("Level must be a whole number between 1 and 100.");
		}
		for (const k of STAT_KEYS) {
			const raw = ivs[k];
			if (raw.trim() === "") continue;
			const n = Number(raw);
			if (!Number.isInteger(n) || n < 0 || n > 31) {
				errs.push(`${STAT_LABELS[k]} IV must be a whole number between 0 and 31.`);
			}
		}
		for (const k of STAT_KEYS) {
			const raw = evs[k];
			if (raw.trim() === "") continue;
			const n = Number(raw);
			if (!Number.isInteger(n) || n < 0 || n > 252) {
				errs.push(`${STAT_LABELS[k]} EV must be a whole number between 0 and 252.`);
			}
		}
		if (evSum > 510) errs.push(`EV total (${evSum}) must not exceed 510.`);
		const filledMoves = moves.map((m) => m.trim()).filter(Boolean);
		if (filledMoves.length > 4) errs.push("A specimen can have at most 4 moves.");
		return errs;
	}, [level, ivs, evs, evSum, moves]);

	function addRibbon() {
		const val = ribbonDraft.trim();
		if (!val) return;
		setRibbons((prev) => (prev.includes(val) ? prev : [...prev, val]));
		setRibbonDraft("");
	}

	async function handleBoxChange(e: React.ChangeEvent<HTMLSelectElement>) {
		const val = e.target.value;
		if (val === NEW_BOX_VALUE) {
			const name = window.prompt("New box name")?.trim();
			if (!name) return;
			try {
				const box = await createBox(name);
				setBoxes((prev) => [...prev, box]);
				setBoxId(box.id);
			} catch (err) {
				setServerErrors([err instanceof Error ? err.message : "Couldn't create the box."]);
			}
			return;
		}
		setBoxId(val || null);
	}

	async function handleSave() {
		if (!speciesInfo || clientErrors.length > 0 || saving) return;
		setSaving(true);
		setServerErrors([]);
		const input: SpecimenInput = {
			speciesId: speciesInfo.id,
			formId,
			nickname: nickname.trim() || null,
			level: level.trim() === "" ? null : Number(level),
			isShiny,
			gender: gender || null,
			nature: nature.trim() || null,
			ability: ability.trim() || null,
			heldItem: heldItem.trim() || null,
			ball: ball.trim() || null,
			otName: otName.trim() || null,
			otId: otId.trim() || null,
			metLocation: metLocation.trim() || null,
			metDate: metDate.trim() || null,
			originGame: originGame.trim() || null,
			originEra: originEra.trim() || null,
			isEvent,
			eventName: isEvent ? eventName.trim() || null : null,
			ribbons,
			ivs: statsToBlock(ivs),
			evs: statsToBlock(evs),
			moves: moves.map((m) => m.trim()).filter(Boolean),
			notes: notes.trim() || null,
			boxId,
		};
		try {
			if (mode === "edit" && specimenId) {
				await updateSpecimen(specimenId, input);
			} else {
				await createSpecimen(input);
			}
			onSaved();
		} catch (err) {
			if (err instanceof ApiValidationError) setServerErrors(err.errors);
			else if (err instanceof AuthRequiredError) setServerErrors(["Your session expired — please sign in again."]);
			else setServerErrors([err instanceof Error ? err.message : "Something went wrong. Please try again."]);
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete() {
		if (!specimenId) return;
		setDeleting(true);
		setServerErrors([]);
		try {
			await deleteSpecimen(specimenId);
			onSaved();
		} catch (err) {
			setServerErrors([err instanceof Error ? err.message : "Couldn't delete this specimen."]);
			setDeleting(false);
		}
	}

	const displayName = nickname.trim() || (speciesInfo ? formatName(speciesInfo.name) : "");

	return (
		<div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
			<div
				className="modal editor-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="editor-title"
			>
				<div className="modal__header">
					<h2 id="editor-title" className="modal__title">
						{mode === "edit" ? "Edit specimen" : "Add to collection"}
					</h2>
					<button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
						✕
					</button>
				</div>

				{loading && (
					<div className="modal__body">
						<p className="state__title">Loading…</p>
					</div>
				)}

				{!loading && loadError && (
					<div className="modal__body">
						<p className="error-banner" role="alert">
							{loadError}
						</p>
						<button type="button" className="button" onClick={onClose}>
							Close
						</button>
					</div>
				)}

				{!loading && !loadError && speciesInfo && confirmingDelete && (
					<div className="modal__body editor-delete-confirm">
						<p className="settings-section__hint">
							This permanently removes {displayName} from your collection. This cannot be undone.
						</p>
						<label className="field-label" htmlFor="editor-delete-confirm">
							Type "delete" to confirm
						</label>
						<input
							id="editor-delete-confirm"
							className="input input--full"
							value={deleteConfirmText}
							onChange={(e) => setDeleteConfirmText(e.target.value)}
							placeholder="delete"
						/>
						{serverErrors.length > 0 && (
							<ul className="error-banner editor-error-list" role="alert">
								{serverErrors.map((msg) => (
									<li key={msg}>{msg}</li>
								))}
							</ul>
						)}
						<div className="editor-actions">
							<button
								type="button"
								className="button"
								onClick={() => {
									setConfirmingDelete(false);
									setDeleteConfirmText("");
								}}
							>
								Cancel
							</button>
							<button
								type="button"
								className="button button--danger"
								disabled={deleteConfirmText.trim().toLowerCase() !== "delete" || deleting}
								onClick={handleDelete}
							>
								{deleting ? "Deleting…" : "Delete specimen"}
							</button>
						</div>
					</div>
				)}

				{!loading && !loadError && speciesInfo && !confirmingDelete && (
					<form
						className="modal__body editor-form"
						onSubmit={(e) => {
							e.preventDefault();
							handleSave();
						}}
					>
						<div className="editor-identity-preview">
							<Sprite
								homeId={speciesInfo.homeId ?? speciesInfo.id}
								shiny={isShiny}
								alt={formatName(speciesInfo.name)}
							/>
							<div>
								<p className="editor-species-name">{formatName(speciesInfo.name)}</p>
								<p className="mono">{formatDexNumber(speciesInfo.id)}</p>
							</div>
						</div>

						<fieldset className="editor-section">
							<legend className="editor-section__legend">Identity</legend>
							<div className="editor-grid">
								<div>
									<label className="field-label" htmlFor="editor-form">
										Form
									</label>
									<select
										id="editor-form"
										ref={firstFieldRef}
										className="select input--full"
										value={formId ?? ""}
										onChange={(e) => setFormId(e.target.value ? Number(e.target.value) : null)}
									>
										<option value="">Base</option>
										{speciesInfo.forms.map((f) => (
											<option key={f.id} value={f.id}>
												{formatName(f.name)}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className="field-label" htmlFor="editor-nickname">
										Nickname
									</label>
									<input
										id="editor-nickname"
										className="input input--full"
										value={nickname}
										onChange={(e) => setNickname(e.target.value)}
										maxLength={24}
									/>
								</div>
								<div>
									<label className="field-label" htmlFor="editor-level">
										Level
									</label>
									<input
										id="editor-level"
										type="number"
										min={1}
										max={100}
										className="input input--full"
										value={level}
										onChange={(e) => setLevel(e.target.value)}
									/>
								</div>
								<div className="editor-checkbox-field">
									<span className="field-label">Shiny</span>
									<label className="toggle">
										<input
											type="checkbox"
											checked={isShiny}
											onChange={(e) => setIsShiny(e.target.checked)}
										/>
										<span>{isShiny ? "✨ Shiny" : "Not shiny"}</span>
									</label>
								</div>
								<div>
									<label className="field-label" htmlFor="editor-gender">
										Gender
									</label>
									<select
										id="editor-gender"
										className="select input--full"
										value={gender}
										onChange={(e) => setGender(e.target.value)}
									>
										{GENDER_OPTIONS.map((g) => (
											<option key={g.value} value={g.value}>
												{g.label}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className="field-label" htmlFor="editor-nature">
										Nature
									</label>
									<input
										id="editor-nature"
										className="input input--full"
										value={nature}
										onChange={(e) => setNature(e.target.value)}
									/>
								</div>
								<div>
									<label className="field-label" htmlFor="editor-ability">
										Ability
									</label>
									<input
										id="editor-ability"
										className="input input--full"
										value={ability}
										onChange={(e) => setAbility(e.target.value)}
									/>
								</div>
								<div>
									<label className="field-label" htmlFor="editor-helditem">
										Held item
									</label>
									<input
										id="editor-helditem"
										className="input input--full"
										value={heldItem}
										onChange={(e) => setHeldItem(e.target.value)}
									/>
								</div>
								<div>
									<label className="field-label" htmlFor="editor-ball">
										Ball
									</label>
									<input
										id="editor-ball"
										className="input input--full"
										value={ball}
										onChange={(e) => setBall(e.target.value)}
									/>
								</div>
							</div>
						</fieldset>

						<fieldset className="editor-section">
							<legend className="editor-section__legend">Stats</legend>
							<p className="field-label">IVs (0–31)</p>
							<div className="stat-grid">
								{STAT_KEYS.map((k) => (
									<div key={k} className="stat-field">
										<label className="field-label" htmlFor={`editor-iv-${k}`}>
											{STAT_LABELS[k]}
										</label>
										<input
											id={`editor-iv-${k}`}
											type="number"
											min={0}
											max={31}
											className="input input--full"
											value={ivs[k]}
											onChange={(e) => setIvs((s) => ({ ...s, [k]: e.target.value }))}
										/>
									</div>
								))}
							</div>
							<p className="field-label">EVs (0–252)</p>
							<div className="stat-grid">
								{STAT_KEYS.map((k) => (
									<div key={k} className="stat-field">
										<label className="field-label" htmlFor={`editor-ev-${k}`}>
											{STAT_LABELS[k]}
										</label>
										<input
											id={`editor-ev-${k}`}
											type="number"
											min={0}
											max={252}
											className="input input--full"
											value={evs[k]}
											onChange={(e) => setEvs((s) => ({ ...s, [k]: e.target.value }))}
										/>
									</div>
								))}
							</div>
							<p className={`stat-sum${evSum > 510 ? " stat-sum--over" : ""}`} role="status">
								EV total: <strong>{evSum}</strong> / 510
							</p>
						</fieldset>

						<fieldset className="editor-section">
							<legend className="editor-section__legend">Moves</legend>
							<div className="moves-grid">
								{moves.map((mv, i) => (
									<div key={i}>
										<label className="field-label" htmlFor={`editor-move-${i}`}>
											Move {i + 1}
										</label>
										<input
											id={`editor-move-${i}`}
											className="input input--full"
											value={mv}
											onChange={(e) =>
												setMoves((prev) => prev.map((m, idx) => (idx === i ? e.target.value : m)))
											}
										/>
									</div>
								))}
							</div>
						</fieldset>

						<fieldset className="editor-section">
							<legend className="editor-section__legend">Origin & event</legend>
							<div className="editor-grid">
								<div>
									<label className="field-label" htmlFor="editor-otname">
										OT name
									</label>
									<input
										id="editor-otname"
										className="input input--full"
										value={otName}
										onChange={(e) => setOtName(e.target.value)}
									/>
								</div>
								<div>
									<label className="field-label" htmlFor="editor-otid">
										OT ID
									</label>
									<input
										id="editor-otid"
										className="input input--full"
										value={otId}
										onChange={(e) => setOtId(e.target.value)}
									/>
								</div>
								<div>
									<label className="field-label" htmlFor="editor-metloc">
										Met location
									</label>
									<input
										id="editor-metloc"
										className="input input--full"
										value={metLocation}
										onChange={(e) => setMetLocation(e.target.value)}
									/>
								</div>
								<div>
									<label className="field-label" htmlFor="editor-metdate">
										Met date
									</label>
									<input
										id="editor-metdate"
										type="date"
										className="input input--full"
										value={metDate}
										onChange={(e) => setMetDate(e.target.value)}
									/>
								</div>
								<div>
									<label className="field-label" htmlFor="editor-origingame">
										Origin game
									</label>
									<input
										id="editor-origingame"
										className="input input--full"
										value={originGame}
										onChange={(e) => setOriginGame(e.target.value)}
									/>
								</div>
								<div>
									<label className="field-label" htmlFor="editor-originera">
										Origin era
									</label>
									<input
										id="editor-originera"
										className="input input--full"
										value={originEra}
										onChange={(e) => setOriginEra(e.target.value)}
									/>
								</div>
							</div>
							<label className="toggle">
								<input type="checkbox" checked={isEvent} onChange={(e) => setIsEvent(e.target.checked)} />
								<span>This is an event distribution</span>
							</label>
							{isEvent && (
								<div>
									<label className="field-label" htmlFor="editor-eventname">
										Event name
									</label>
									<input
										id="editor-eventname"
										className="input input--full"
										value={eventName}
										onChange={(e) => setEventName(e.target.value)}
									/>
								</div>
							)}
						</fieldset>

						<fieldset className="editor-section">
							<legend className="editor-section__legend">Ribbons</legend>
							{ribbons.length > 0 && (
								<div className="tag-list">
									{ribbons.map((r) => (
										<span key={r} className="tag">
											{r}
											<button
												type="button"
												className="tag__remove"
												aria-label={`Remove ribbon ${r}`}
												onClick={() => setRibbons((prev) => prev.filter((x) => x !== r))}
											>
												✕
											</button>
										</span>
									))}
								</div>
							)}
							<div>
								<label className="field-label" htmlFor="editor-ribbon-draft">
									Add a ribbon
								</label>
								<div className="editor-tag-input__row">
									<input
										id="editor-ribbon-draft"
										className="input input--full"
										value={ribbonDraft}
										onChange={(e) => setRibbonDraft(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												addRibbon();
											}
										}}
										placeholder="e.g. Battle Champion Ribbon"
									/>
									<button type="button" className="button" onClick={addRibbon}>
										Add
									</button>
								</div>
							</div>
						</fieldset>

						<fieldset className="editor-section">
							<legend className="editor-section__legend">Storage & notes</legend>
							<div>
								<label className="field-label" htmlFor="editor-box">
									Box
								</label>
								<select id="editor-box" className="select input--full" value={boxId ?? ""} onChange={handleBoxChange}>
									<option value="">No box</option>
									{boxes.map((b) => (
										<option key={b.id} value={b.id}>
											{b.name}
										</option>
									))}
									<option value={NEW_BOX_VALUE}>＋ New box…</option>
								</select>
							</div>
							<div>
								<label className="field-label" htmlFor="editor-notes">
									Notes
								</label>
								<textarea
									id="editor-notes"
									className="input input--full textarea"
									rows={3}
									value={notes}
									onChange={(e) => setNotes(e.target.value)}
								/>
							</div>
						</fieldset>

						{clientErrors.length > 0 && (
							<ul className="error-banner editor-error-list" role="alert">
								{clientErrors.map((msg) => (
									<li key={msg}>{msg}</li>
								))}
							</ul>
						)}
						{serverErrors.length > 0 && (
							<ul className="error-banner editor-error-list" role="alert">
								{serverErrors.map((msg) => (
									<li key={msg}>{msg}</li>
								))}
							</ul>
						)}

						<div className="editor-actions">
							{mode === "edit" && (
								<button
									type="button"
									className="button button--danger"
									onClick={() => setConfirmingDelete(true)}
								>
									Delete
								</button>
							)}
							<div className="editor-actions__spacer" />
							<button type="button" className="button" onClick={onClose}>
								Cancel
							</button>
							<button type="submit" className="button button--primary" disabled={saving || clientErrors.length > 0}>
								{saving ? "Saving…" : mode === "edit" ? "Save changes" : "Add to collection"}
							</button>
						</div>
					</form>
				)}
			</div>
		</div>
	);
}
