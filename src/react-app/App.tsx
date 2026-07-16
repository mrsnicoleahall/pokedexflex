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
import { BrandCorner } from "./components/BrandCorner";
import { PublicProfile } from "./pages/PublicProfile";
import { Versus } from "./pages/Versus";
import { EventsCatalog } from "./pages/EventsCatalog";
import { Forms } from "./pages/Forms";
import { Home } from "./pages/Home";
import { ImportExport } from "./pages/ImportExport";
import { Leaderboard } from "./pages/Leaderboard";
import { MyCollection } from "./pages/MyCollection";
import { SignInVerify } from "./pages/SignInVerify";
import { Wanted } from "./pages/Wanted";
import { Contact } from "./pages/Contact";
import { Progress } from "./pages/Progress";
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
		<>
			<BrandCorner />
			<Routes>
				<Route path="/u/:handle" element={<PublicProfile />} />
				<Route path="/versus/:a/:b" element={<Versus />} />
				<Route path="/leaderboard" element={<Leaderboard />} />
				<Route path="/signin" element={<SignInVerify />} />
				<Route element={<AppLayout />}>
					<Route index element={<HomeRoute />} />
					<Route path="species" element={<SpeciesRoute />} />
					<Route path="events" element={<EventsRoute />} />
					<Route path="forms" element={<Forms />} />
					<Route path="collection" element={<CollectionRoute />} />
				<Route path="wanted" element={<Wanted />} />
					<Route path="ribbons" element={<Ribbons />} />
					<Route path="progress" element={<Progress />} />
					<Route path="import-export" element={<ImportExport />} />
					<Route path="settings" element={<SettingsRoute />} />
				<Route path="contact" element={<Contact />} />
					<Route path="*" element={<HomeRoute />} />
				</Route>
			</Routes>
		</>
	);
}

export default App;
