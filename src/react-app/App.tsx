// src/react-app/App.tsx

import { useState } from "react";
import type { AccountView } from "./components/AccountMenu";
import { TopBar, type Tab } from "./components/TopBar";
import { Footer } from "./components/Footer";
import { ProfileSetup } from "./components/ProfileSetup";
import { EventsCatalog } from "./pages/EventsCatalog";
import { Home } from "./pages/Home";
import { ImportExport } from "./pages/ImportExport";
import { MyCollection } from "./pages/MyCollection";
import { Ribbons } from "./pages/Ribbons";
import { Settings } from "./pages/Settings";
import { SpeciesCatalog } from "./pages/SpeciesCatalog";
import { RosetteSprite } from "./ribbons/RosetteSprite";
import { useAuth } from "./auth/AuthProvider";
import { needsOnboarding } from "./profile/display";

type View = "home" | "catalog" | AccountView;

function App() {
	const [tab, setTab] = useState<Tab>("species");
	const [q, setQ] = useState("");
	const [gen, setGen] = useState<number | undefined>(undefined);
	const [view, setView] = useState<View>("home");
	const { user, loading } = useAuth();

	const backToCatalog = () => setView("catalog");
	const goHome = () => setView("home");

	function handleTabChange(next: Tab) {
		setTab(next);
		setView("catalog");
	}

	if (!loading && needsOnboarding(user)) {
		return (
			<div className="app">
				<ProfileSetup />
			</div>
		);
	}

	return (
		<div className="app">
			<RosetteSprite />
			<TopBar
				tab={tab}
				onTabChange={handleTabChange}
				search={q}
				onSearchChange={setQ}
				gen={gen}
				onGenChange={setGen}
				showFilters={view === "catalog"}
				onNavigate={setView}
				onLogoClick={goHome}
			/>
			{view === "home" ? (
				<Home onBrowse={() => handleTabChange("species")} onNavigate={setView} />
			) : view === "settings" ? (
				<Settings onBack={backToCatalog} />
			) : view === "collection" ? (
				<MyCollection onBrowseSpecies={() => handleTabChange("species")} />
			) : view === "ribbons" ? (
				<Ribbons />
			) : view === "importExport" ? (
				<ImportExport />
			) : tab === "species" ? (
				<SpeciesCatalog q={q} gen={gen} />
			) : (
				<EventsCatalog q={q} gen={gen} />
			)}
			<Footer />
		</div>
	);
}

export default App;
