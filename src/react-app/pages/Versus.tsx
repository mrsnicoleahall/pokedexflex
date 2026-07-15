// src/react-app/pages/Versus.tsx
//
// Public head-to-head at /versus/:a/:b. Placeholder stub — the real page
// (fetch + round bars + breakdowns + verdict + share card) lands in Flex
// Phase G, Task G5. Ungated + unauthenticated by design (registered outside
// AppLayout, like /u/:handle).

import { useParams } from "react-router-dom";

export function Versus() {
	const { a, b } = useParams<{ a: string; b: string }>();
	return (
		<div className="app">
			<div className="container page">
				<p>
					Versus {a} vs {b} — coming in G5.
				</p>
			</div>
		</div>
	);
}
