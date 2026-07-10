// src/react-app/App.tsx

import { useState } from "react";
import { TopBar, type Tab } from "./components/TopBar";
import { SpeciesCatalog } from "./pages/SpeciesCatalog";
import { EventsCatalog } from "./pages/EventsCatalog";

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
				showFilters
			/>
			{tab === "species" ? <SpeciesCatalog q={q} gen={gen} /> : <EventsCatalog q={q} gen={gen} />}
		</div>
	);
}

export default App;
