// src/react-app/ribbons/TrophyWall.tsx
//
// Read-only "trophy wall" for the signed-in Home dashboard: the user's
// pinned showcase ribbons, in slot order. Empty slots render as blank
// placeholders (not omitted) so the wall's layout stays stable as ribbons
// are pinned/unpinned from the Ribbons page's ShowcasePicker.
import { deriveShowcaseSlots } from "./incentiveDisplay";
import { RibbonIcon } from "./RibbonIcon";
import type { RibbonDto } from "../api";

export function TrophyWall({ showcase, ribbons }: { showcase: (string | null)[]; ribbons: RibbonDto[] }) {
	const slots = deriveShowcaseSlots(showcase, ribbons);
	const pinnedCount = slots.filter((s) => s !== null).length;

	return (
		<section className="trophy-wall">
			<h2 className="ribbon-section__title">Trophy Wall</h2>
			{pinnedCount === 0 ? (
				<p className="trophy-wall__empty">Pin your favorite ribbons from the Ribbons page to show them off here.</p>
			) : (
				<div className="trophy-wall__grid">
					{slots.map((ribbon, i) =>
						ribbon ? (
							<div className="trophy-wall__slot" key={ribbon.id}>
								<RibbonIcon ribbon={{ id: ribbon.id, category: ribbon.category }} size={64} />
								<span className="trophy-wall__name">{ribbon.name}</span>
							</div>
						) : (
							<div className="trophy-wall__slot trophy-wall__slot--empty" key={`empty-${i}`} aria-hidden="true" />
						),
					)}
				</div>
			)}
		</section>
	);
}
