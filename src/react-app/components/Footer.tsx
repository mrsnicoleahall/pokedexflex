// src/react-app/components/Footer.tsx
//
// A subtle, app-wide footer. Keeps a low-key "tip the dev" Cash App link so
// it's discoverable without being pushy — muted text, no bright button.

export function Footer() {
	return (
		<footer className="app-footer">
			<span className="app-footer__name">PokéDexFlex</span>
			<span className="app-footer__dot" aria-hidden="true">
				·
			</span>
			<a
				className="app-footer__tip"
				href="https://cash.app/$NicoleGetsTheStrap"
				target="_blank"
				rel="noopener noreferrer"
			>
				<span aria-hidden="true">♥</span> Tip the dev
			</a>
		</footer>
	);
}
