// src/react-app/components/AppLayout.tsx
//
// The authenticated app shell (Flex Phase F): owns the catalog search/gen
// filter state, renders the TopBar + Footer + the RosetteSprite, enforces the
// blocking onboarding gate, and renders the current route's page through
// <Outlet>. Every app route is a child of this layout; the public
// /u/:handle route is registered OUTSIDE it (App.tsx) so it is not gated.

import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { needsOnboarding } from "../profile/display";
import { pathForAccountView, PATHS, showFiltersForPath, tabForPath } from "../routes";
import { Footer } from "./Footer";
import { ProfileSetup } from "./ProfileSetup";
import { RosetteSprite } from "../ribbons/RosetteSprite";
import { TopBar } from "./TopBar";

/** Shared via <Outlet context> so catalog routes can read the live filter state. */
export type LayoutContext = { q: string; gen: number | undefined };

export function AppLayout() {
	const [q, setQ] = useState("");
	const [gen, setGen] = useState<number | undefined>(undefined);
	const { user, loading } = useAuth();
	const location = useLocation();
	const navigate = useNavigate();

	if (!loading && needsOnboarding(user)) {
		return (
			<div className="app">
				<ProfileSetup />
			</div>
		);
	}

	const context: LayoutContext = { q, gen };

	return (
		<div className="app">
			<RosetteSprite />
			<TopBar
				tab={tabForPath(location.pathname)}
				onTabChange={(next) => navigate(next === "events" ? PATHS.events : PATHS.species)}
				search={q}
				onSearchChange={setQ}
				gen={gen}
				onGenChange={setGen}
				showFilters={showFiltersForPath(location.pathname)}
				onNavigate={(view) => navigate(pathForAccountView(view))}
				onLogoClick={() => navigate(PATHS.home)}
			/>
			<Outlet context={context} />
			<Footer />
		</div>
	);
}
