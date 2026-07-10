// src/react-app/pages/SpeciesCatalog.tsx

import { useEffect, useState } from "react";
import { fetchSpecies, type SpeciesDto } from "../api";

export function SpeciesCatalog() {
	const [q, setQ] = useState("");
	const [items, setItems] = useState<SpeciesDto[]>([]);
	const [total, setTotal] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const t = setTimeout(() => {
			fetchSpecies({ q })
				.then((r) => {
					setItems(r.items);
					setTotal(r.total);
					setError(null);
				})
				.catch((err: unknown) => {
					setError(err instanceof Error ? err.message : String(err));
				});
		}, 200);
		return () => clearTimeout(t);
	}, [q]);

	return (
		<div>
			<h1>PokeFlexDex — Catalog</h1>
			<input
				placeholder="Search species…"
				value={q}
				onChange={(e) => setQ(e.target.value)}
				aria-label="Search species"
			/>
			{error && <p role="alert">Error: {error}</p>}
			{total !== null && <p>{total} species found</p>}
			<ul>
				{items.map((s) => (
					<li key={s.id}>
						#{s.id} {s.name} — {s.types.join("/")}
						{s.forms.length > 0 && (
							<> · forms: {s.forms.map((f) => f.name).join(", ")}</>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
