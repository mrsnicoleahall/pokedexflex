// src/react-app/auth/AuthProvider.tsx
//
// Auth context for the whole app: fetches the signed-in user (via the
// httpOnly session cookie) on mount, and exposes actions for requesting a
// sign-in link, logging out, and re-checking the session. Consumers read
// state through the `useAuth()` hook.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { authLogout, authMe, authRequestLink, type UserDto } from "../api";

type AuthContextValue = {
	user: UserDto | null;
	loading: boolean;
	requestLink: (email: string) => Promise<{ ok: boolean; devLink?: string }>;
	logout: () => Promise<void>;
	refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<UserDto | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		const { user } = await authMe();
		setUser(user);
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const { user } = await authMe();
			if (!cancelled) {
				setUser(user);
				setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const requestLink = useCallback((email: string) => authRequestLink(email), []);

	const logout = useCallback(async () => {
		await authLogout();
		setUser(null);
	}, []);

	const value = useMemo<AuthContextValue>(
		() => ({ user, loading, requestLink, logout, refresh }),
		[user, loading, requestLink, logout, refresh],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
	return ctx;
}
