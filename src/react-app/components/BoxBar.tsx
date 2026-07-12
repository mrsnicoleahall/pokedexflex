// src/react-app/components/BoxBar.tsx
//
// Row of box-filter pills for My Collection: "All" plus one pill per box
// (with its specimen count), a "+ New box" affordance, and small
// rename/delete icon buttons on each box pill. Selecting a pill filters the
// collection grid by box (controlled by the parent via `selectedBoxId` /
// `onSelect`); the create/rename/delete actions call straight through to the
// boxes API and then ask the parent to refetch via `onChanged`.

import { useState } from "react";
import { createBox, deleteBox, renameBox, type BoxDto } from "../api";

type BoxBarProps = {
	boxes: BoxDto[];
	selectedBoxId: string | null;
	onSelect: (boxId: string | null) => void;
	onChanged: () => void;
};

export function BoxBar({ boxes, selectedBoxId, onSelect, onChanged }: BoxBarProps) {
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function handleNewBox() {
		const name = window.prompt("New box name")?.trim();
		if (!name) return;
		setBusy(true);
		setError(null);
		try {
			await createBox(name);
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't create the box.");
		} finally {
			setBusy(false);
		}
	}

	async function handleRename(box: BoxDto) {
		const name = window.prompt("Rename box", box.name)?.trim();
		if (!name || name === box.name) return;
		setBusy(true);
		setError(null);
		try {
			await renameBox(box.id, name);
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't rename the box.");
		} finally {
			setBusy(false);
		}
	}

	async function handleDelete(box: BoxDto) {
		const confirmed = window.confirm(
			`Delete "${box.name}"? Specimens inside stay in your collection, unboxed.`,
		);
		if (!confirmed) return;
		setBusy(true);
		setError(null);
		try {
			await deleteBox(box.id);
			if (selectedBoxId === box.id) onSelect(null);
			onChanged();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn't delete the box.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="box-bar">
			<div className="box-bar__pills" role="group" aria-label="Filter by box">
				<button
					type="button"
					className="box-bar__pill"
					aria-pressed={selectedBoxId === null}
					onClick={() => onSelect(null)}
				>
					All
				</button>
				{boxes.map((box) => (
					<span key={box.id} className="box-bar__pill-wrap">
						<button
							type="button"
							className="box-bar__pill"
							aria-pressed={selectedBoxId === box.id}
							onClick={() => onSelect(box.id)}
						>
							{box.name}
							<span className="box-bar__count">{box.count}</span>
						</button>
						<span className="box-bar__pill-actions">
							<button
								type="button"
								className="box-bar__icon-btn"
								aria-label={`Rename ${box.name}`}
								disabled={busy}
								onClick={() => handleRename(box)}
							>
								✎
							</button>
							<button
								type="button"
								className="box-bar__icon-btn"
								aria-label={`Delete ${box.name}`}
								disabled={busy}
								onClick={() => handleDelete(box)}
							>
								🗑
							</button>
						</span>
					</span>
				))}
				<button
					type="button"
					className="box-bar__pill box-bar__pill--new"
					disabled={busy}
					onClick={handleNewBox}
				>
					＋ New box
				</button>
			</div>
			{error && (
				<p className="error-banner" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
