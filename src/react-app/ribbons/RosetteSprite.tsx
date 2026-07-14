// Defines the rosette geometry ONCE as a hidden, reusable <symbol>. Every
// RibbonFrame then references it via <use>, instead of re-inlining ~47
// <path>s (and a duplicate clipPath id) per ribbon. Mount this exactly once
// near the root of the app so `#pfd-rosette` exists on every page.
import { ROSETTE_SYMBOL_INNER } from "./rosette";

export function RosetteSprite() {
	return (
		<svg
			width="0"
			height="0"
			aria-hidden="true"
			style={{ position: "absolute" }}
			dangerouslySetInnerHTML={{
				__html: `<symbol id="pfd-rosette" viewBox="0 0 1616.28 1680.23">${ROSETTE_SYMBOL_INNER}</symbol>`,
			}}
		/>
	);
}
