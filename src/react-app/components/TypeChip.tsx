// src/react-app/components/TypeChip.tsx
//
// Icon-only type chip: a circle filled with the type's signature color,
// with the type glyph masked through in a contrasting color. No text label,
// but TypeIcon supplies role="img"/aria-label/title for accessibility.

import { getContrastText, typeColor } from "../theme";
import { TypeIcon } from "./TypeIcon";

export function TypeChip({ type }: { type: string }) {
	const color = typeColor(type);
	return (
		<span className="chip chip--type" style={{ backgroundColor: color }}>
			<TypeIcon type={type} color={getContrastText(color)} size={16} />
		</span>
	);
}
