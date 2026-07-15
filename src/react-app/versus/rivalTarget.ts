// src/react-app/versus/rivalTarget.ts
//
// Pure helper (Flex Phase G): given the signed-in viewer's handle and the two
// sides of a matchup, returns the handle the viewer would SAVE as a rivalry
// (the OTHER side), or null if the viewer is a spectator / has no handle. Kept
// DOM-free so it's unit-testable (see the BUILD-GATE split).

export function rivalTargetHandle(args: {
	viewerHandle: string | null;
	aHandle: string;
	bHandle: string;
}): string | null {
	const { viewerHandle, aHandle, bHandle } = args;
	if (!viewerHandle) return null;
	if (viewerHandle === aHandle) return bHandle;
	if (viewerHandle === bHandle) return aHandle;
	return null;
}
