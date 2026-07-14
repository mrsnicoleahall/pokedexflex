// src/react-app/components/TypeIcon.tsx
//
// A single Pokémon type glyph, recolored via the CSS mask technique: the
// monochrome SVG in public/types/<type>.svg becomes the alpha mask and
// `color` paints through it. No text; screen-reader-labeled with the type.

import { typeIconUrl } from "../theme";

export function TypeIcon({ type, color, size = 18 }: { type: string; color: string; size?: number }) {
	const url = `url(${typeIconUrl(type)})`;
	return (
		<span
			className="type-icon"
			role="img"
			aria-label={type}
			title={type}
			style={{
				width: size,
				height: size,
				backgroundColor: color,
				WebkitMaskImage: url,
				maskImage: url,
			}}
		/>
	);
}
