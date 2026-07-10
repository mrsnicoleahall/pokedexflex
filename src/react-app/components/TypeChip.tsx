// src/react-app/components/TypeChip.tsx

import { getContrastText, typeColor } from "../theme";

export function TypeChip({ type }: { type: string }) {
	const color = typeColor(type);
	return (
		<span
			className="chip"
			style={{
				backgroundColor: color,
				color: getContrastText(color),
			}}
		>
			{type}
		</span>
	);
}
