// src/react-app/components/BrandCorner.tsx
//
// Ambient brand mark: the app icon, large + faded + slowly rotating, pinned to
// the bottom-right of every page. Purely decorative — aria-hidden with no
// pointer events, and it sits behind the app content. The spin is disabled
// under prefers-reduced-motion (see .brand-corner in styles.css).

export function BrandCorner() {
	return <img src="/brand/icon-512.png" alt="" aria-hidden="true" className="brand-corner" />;
}
