// src/react-app/pages/PublicProfile.tsx
//
// Public trainer profile at /u/:handle. Placeholder stub — the real page
// (fetch + Avatar/FavoritesStrip/RankBadge/showcase) lands in Flex Phase F,
// Task F5. Ungated + unauthenticated by design (registered outside AppLayout).

import { useParams } from "react-router-dom";

export function PublicProfile() {
	const { handle } = useParams<{ handle: string }>();
	return (
		<div className="app">
			<div className="container page">
				<p>Public profile for {handle} — coming in F5.</p>
			</div>
		</div>
	);
}
