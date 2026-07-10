// src/react-app/components/TopBar.tsx

import { ThemeToggle } from "./ThemeToggle";

export type Tab = "species" | "events";

const GENERATIONS = Array.from({ length: 9 }, (_, i) => i + 1);

type TopBarProps = {
	tab: Tab;
	onTabChange: (tab: Tab) => void;
	search: string;
	onSearchChange: (value: string) => void;
	gen: number | undefined;
	onGenChange: (value: number | undefined) => void;
	showFilters: boolean;
};

export function TopBar({
	tab,
	onTabChange,
	search,
	onSearchChange,
	gen,
	onGenChange,
	showFilters,
}: TopBarProps) {
	return (
		<header className="toolbar">
			<div className="toolbar__inner container">
				<span className="wordmark">PokeFlexDex</span>

				<nav className="tabs" role="tablist" aria-label="Sections">
					<button
						type="button"
						role="tab"
						className="tab"
						aria-selected={tab === "species"}
						onClick={() => onTabChange("species")}
					>
						Species
					</button>
					<button
						type="button"
						role="tab"
						className="tab"
						aria-selected={tab === "events"}
						onClick={() => onTabChange("events")}
					>
						Events
					</button>
				</nav>

				<div className="toolbar__controls">
					{showFilters && (
						<>
							<input
								className="input"
								type="search"
								placeholder="Search species…"
								value={search}
								onChange={(e) => onSearchChange(e.target.value)}
								aria-label="Search species"
							/>
							<select
								className="select"
								value={gen ?? ""}
								onChange={(e) =>
									onGenChange(e.target.value ? Number(e.target.value) : undefined)
								}
								aria-label="Filter by generation"
							>
								<option value="">All generations</option>
								{GENERATIONS.map((g) => (
									<option key={g} value={g}>
										Gen {g}
									</option>
								))}
							</select>
						</>
					)}
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}
