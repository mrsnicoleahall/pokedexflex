// src/react-app/ribbons/NudgeList.tsx
//
// "Closest to earning" nudge list for the signed-in Home dashboard. Renders
// the API's `nearest` array (already ranked, filtered to locked/non-secret
// ribbons server-side by nearestRibbons in src/worker/ribbons/scoring.ts) as
// a compact progress list — no re-sorting or re-filtering here, this
// component only formats what the server already decided to show.
import { nudgePct } from "./incentiveDisplay";
import { RibbonIcon } from "./RibbonIcon";
import type { RibbonDto } from "../api";

export function NudgeList({ nearest }: { nearest: RibbonDto[] }) {
	if (nearest.length === 0) return null;

	return (
		<section className="nudge-list">
			<h2 className="ribbon-section__title">Almost there</h2>
			<ul className="nudge-list__items">
				{nearest.map((r) => {
					const pct = nudgePct(r);
					return (
						<li className="nudge-list__item" key={r.id}>
							<RibbonIcon ribbon={{ id: r.id, category: r.category }} size={40} />
							<div className="nudge-list__body">
								<span className="nudge-list__name">{r.name}</span>
								<div
									className="nudge-list__track"
									role="progressbar"
									aria-valuenow={r.progress.current}
									aria-valuemin={0}
									aria-valuemax={r.progress.total}
									aria-label={`${r.name} progress`}
								>
									<div className="nudge-list__fill" style={{ width: `${pct}%` }} />
								</div>
								<span className="nudge-list__count">
									{r.progress.current} / {r.progress.total}
								</span>
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
