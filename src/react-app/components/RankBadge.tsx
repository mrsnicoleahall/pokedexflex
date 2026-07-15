// src/react-app/components/RankBadge.tsx
//
// Compact Trainer Score + rank display, reused on the Ribbons page header
// and the signed-in Home dashboard. Purely presentational — reads
// `trainerScore`/`rank` verbatim from useRibbonsData; never recomputes rank.
import { rankColor } from "../ribbons/incentiveDisplay";

export function RankBadge({
	trainerScore,
	rank,
	size = "md",
}: {
	trainerScore: number;
	rank: string;
	size?: "sm" | "md";
}) {
	const color = rankColor(rank);
	return (
		<div className={`rank-badge rank-badge--${size}`} style={{ borderColor: color }}>
			<span className="rank-badge__rank" style={{ color }}>
				{rank}
			</span>
			<span className="rank-badge__score">
				{trainerScore.toLocaleString()} <small>pts</small>
			</span>
		</div>
	);
}
