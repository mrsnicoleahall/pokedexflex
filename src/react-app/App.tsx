// src/react-app/App.tsx

import { useState } from "react";
import type { AccountView } from "./components/AccountMenu";
import { TopBar, type Tab } from "./components/TopBar";
import { ComingSoon } from "./pages/ComingSoon";
import { EventsCatalog } from "./pages/EventsCatalog";
import { Home } from "./pages/Home";
import { Settings } from "./pages/Settings";
import { SpeciesCatalog } from "./pages/SpeciesCatalog";

type View = "home" | "catalog" | AccountView;

function App() {
	const [tab, setTab] = useState<Tab>("species");
	const [q, setQ] = useState("");
	const [gen, setGen] = useState<number | undefined>(undefined);
	const [view, setView] = useState<View>("home");

	const backToCatalog = () => setView("catalog");
	const goHome = () => setView("home");

	function handleTabChange(next: Tab) {
		setTab(next);
		setView("catalog");
	}

	return (
		<div className="app">
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
				<ComingSoon title="My Collection" onBack={backToCatalog} />
			) : view === "ribbons" ? (
				<ComingSoon title="Ribbons" onBack={backToCatalog} />
			) : tab === "species" ? (
				<SpeciesCatalog q={q} gen={gen} />
			) : (
				<EventsCatalog q={q} gen={gen} />
			)}
		</div>
	);
}

export default App;
