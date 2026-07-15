// src/react-app/pages/Progress.tsx
//
// "Progress" view: STUB for Flex Task H4, which replaces this with the real
// per-type/per-gen completion dashboard (reusing RankBadge, TypeIcon,
// --brand-grad, .container.page, and .ribbon-section__title per the
// frontend-design constraints — consistent with PublicProfile/Home, not a
// new design system). Signed-out visitors get the same friendly nudge as
// other gated pages (see Settings.tsx) instead of a crash or blank page.

import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { PATHS } from "../routes";

export function Progress() {
	const { user } = useAuth();

	if (!user) {
		return (
			<div className="page container">
				<div className="state">
					<p className="state__title">You're signed out</p>
					<Link className="button" to={PATHS.home}>
						Back
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="container page">
			<h1 className="ribbon-section__title">Progress</h1>
			<p className="state__hint">Your completion dashboard is coming soon.</p>
		</div>
	);
}
