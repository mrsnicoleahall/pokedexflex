// src/react-app/App.tsx
//
// Client route table (Flex Phase F). Authenticated views render inside
// AppLayout (TopBar/Footer/onboarding gate); the public trainer profile at
// /u/:handle is a top-level, ungated route. Thin wrapper components adapt the
// existing page callback props (onBrowse/onNavigate/onBack/onBrowseSpecies) to
// react-router navigation, and feed the catalog pages the layout's live
// search/gen filter state via useOutletContext.

import { Routes, Route, useNavigate, useOutletContext } from "react-router-dom";
import { AppLayout, type LayoutContext } from "./components/AppLayout";
import { PublicProfile } from "./pages/PublicProfile";
import { Versus } from "./pages/Versus";
import { EventsCatalog } from "./pages/EventsCatalog";
import { Home } from "./pages/Home";
import { ImportExport } from "./pages/ImportExport";
import { MyCollection } from "./pages/MyCollection";
import { Ribbons } from "./pages/Ribbons";
import { Settings } from "./pages/Settings";
import { SpeciesCatalog } from "./pages/SpeciesCatalog";
import { PATHS, pathForAccountView } from "./routes";

function HomeRoute() {
	const navigate = useNavigate();
	return <Home onBrowse={() => navigate(PATHS.species)} onNavigate={(view) => navigate(pathForAccountView(view))} />;
}

function SpeciesRoute() {
	const { q, gen } = useOutletContext<LayoutContext>();
	return <SpeciesCatalog q={q} gen={gen} />;
}

function EventsRoute() {
	const { q, gen } = useOutletContext<LayoutContext>();
	return <EventsCatalog q={q} gen={gen} />;
}

function CollectionRoute() {
	const navigate = useNavigate();
	return <MyCollection onBrowseSpecies={() => navigate(PATHS.species)} />;
}

function SettingsRoute() {
	const navigate = useNavigate();
	return <Settings onBack={() => navigate(PATHS.home)} />;
}

function App() {
	return (
		<Routes>
			<Route path="/u/:handle" element={<PublicProfile />} />
			<Route path="/versus/:a/:b" element={<Versus />} />
			<Route element={<AppLayout />}>
				<Route index element={<HomeRoute />} />
				<Route path="species" element={<SpeciesRoute />} />
				<Route path="events" element={<EventsRoute />} />
				<Route path="collection" element={<CollectionRoute />} />
				<Route path="ribbons" element={<Ribbons />} />
				<Route path="import-export" element={<ImportExport />} />
				<Route path="settings" element={<SettingsRoute />} />
				<Route path="*" element={<HomeRoute />} />
			</Route>
		</Routes>
	);
}

export default App;
