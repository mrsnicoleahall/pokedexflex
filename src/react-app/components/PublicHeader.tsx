// src/react-app/components/PublicHeader.tsx
//
// Minimal header for the ungated public pages (Leaderboard, Public Profile,
// Versus) that render outside AppLayout: the brandmark linking home plus the
// theme toggle. Deliberately no AccountMenu — matches the marketing chrome, not
// the signed-in app shell. Uses the same brandmark treatment (icon + gradient
// wordmark) as the TopBar so the brand reads identically everywhere.

import { Link } from "react-router-dom";
import { PATHS } from "../routes";
import { ThemeToggle } from "./ThemeToggle";

export function PublicHeader() {
	return (
		<header className="toolbar public-profile__bar">
			<div className="toolbar__inner container">
				<Link className="brandmark" to={PATHS.home} aria-label="PokéDexFlex home">
					<span className="brandmark__text">PokéDexFlex</span>
				</Link>
				<div className="toolbar__controls">
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}
