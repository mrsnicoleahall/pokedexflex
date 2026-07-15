// src/react-app/components/EarnMomentToast.tsx
//
// Celebration overlay for newly-earned ribbons (Flex Phase E). Rendered
// whenever useRibbonsData().newlyEarned is non-empty, on both the Ribbons
// page and the Home dashboard. Dismissing calls the caller's `onDismiss`
// (wired to `ackSeen`, which calls POST /api/ribbons/seen) so the same
// batch never re-fires. Shows every newly-earned ribbon in one panel rather
// than a one-at-a-time carousel, so a multi-ribbon batch (e.g. right after
// a big import) reads as one clean celebration instead of a spam of toasts.
import { RibbonIcon } from "../ribbons/RibbonIcon";
import type { RibbonDto } from "../api";

export function EarnMomentToast({ ribbons, onDismiss }: { ribbons: RibbonDto[]; onDismiss: () => void }) {
	if (ribbons.length === 0) return null;

	const heading = ribbons.length === 1 ? "Ribbon earned!" : `${ribbons.length} ribbons earned!`;

	return (
		<div className="earn-toast">
			<div className="earn-toast__panel" role="alertdialog" aria-live="assertive" aria-label={heading}>
				<p className="earn-toast__heading">{heading}</p>
				<div className="earn-toast__grid">
					{ribbons.map((r) => (
						<div className="earn-toast__item" key={r.id}>
							<RibbonIcon ribbon={{ id: r.id, category: r.category }} size={56} />
							{/* Every ribbon here is freshly earned, so reveal its real name — this
							    IS the payoff moment for secret/easter-egg ribbons (don't show "???"). */}
							<span className="earn-toast__name">{r.name}</span>
							{/* Say WHY it was earned (the ribbon's criteria), not just the name. */}
							<span className="earn-toast__desc">{r.description}</span>
						</div>
					))}
				</div>
				<button type="button" className="button button--primary earn-toast__dismiss" onClick={onDismiss}>
					Nice!
				</button>
			</div>
		</div>
	);
}
