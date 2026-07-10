// src/react-app/components/ThemeToggle.tsx
//
// A small light/dark toggle. Defaults to following the OS
// `prefers-color-scheme`; once the user clicks it, their explicit choice
// is persisted to localStorage and stamped onto `<html data-theme>`,
// which wins over the system preference in styles.css.

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "pokeflexdex-theme";

function prefersDark(): boolean {
	return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function readStoredTheme(): Theme | null {
	const stored = localStorage.getItem(STORAGE_KEY);
	return stored === "light" || stored === "dark" ? stored : null;
}

export function ThemeToggle() {
	// `override` is the user's explicit choice, or null to follow the system.
	const [override, setOverride] = useState<Theme | null>(() => readStoredTheme());
	const [systemIsDark, setSystemIsDark] = useState<boolean>(() => prefersDark());

	useEffect(() => {
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, []);

	useEffect(() => {
		if (override) {
			document.documentElement.dataset.theme = override;
			localStorage.setItem(STORAGE_KEY, override);
		} else {
			delete document.documentElement.dataset.theme;
			localStorage.removeItem(STORAGE_KEY);
		}
	}, [override]);

	const effectiveIsDark = override ? override === "dark" : systemIsDark;

	return (
		<button
			type="button"
			className="icon-button"
			aria-label={effectiveIsDark ? "Switch to light theme" : "Switch to dark theme"}
			title={effectiveIsDark ? "Switch to light theme" : "Switch to dark theme"}
			onClick={() => setOverride(effectiveIsDark ? "light" : "dark")}
		>
			{effectiveIsDark ? "☀️" : "🌙"}
		</button>
	);
}
