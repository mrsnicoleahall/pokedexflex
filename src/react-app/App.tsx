// src/react-app/App.tsx

import { useState } from "react";
import { TopBar, type Tab } from "./components/TopBar";
import { SpeciesCatalog } from "./pages/SpeciesCatalog";

function EventsPlaceholder() {
	return (
		<div className="container page">
			<div className="placeholder-panel">
				<span className="placeholder-panel__title">Events — coming soon</span>
				<p>The events catalog will live here, sharing this same design system.</p>
			</div>
		</div>
	);
}

function App() {
	const [tab, setTab] = useState<Tab>("species");
	const [q, setQ] = useState("");
	const [gen, setGen] = useState<number | undefined>(undefined);

	return (
		<div className="app">
			<TopBar
				tab={tab}
				onTabChange={setTab}
				search={q}
				onSearchChange={setQ}
				gen={gen}
				onGenChange={setGen}
				showFilters={tab === "species"}
			/>
			{tab === "species" ? <SpeciesCatalog q={q} gen={gen} /> : <EventsPlaceholder />}
		</div>
	);
}

export default App;
