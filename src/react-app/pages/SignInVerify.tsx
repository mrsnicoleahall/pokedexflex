// src/react-app/pages/SignInVerify.tsx
//
// Landing page for the magic link (/signin?token=…). The email link is a
// cross-site top-level navigation, on which browsers do not reliably persist
// the SameSite=Lax session cookie. So instead of hitting /api/auth/verify by
// navigation, this page — already loaded same-origin — completes sign-in with a
// SAME-ORIGIN fetch to verify (which sets the cookie reliably), refreshes the
// auth session, then routes home. Registered OUTSIDE AppLayout so it renders
// standalone while the visitor is still signed out.

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { PATHS } from "../routes";

export function SignInVerify() {
	const [params] = useSearchParams();
	const token = params.get("token");
	const { refresh } = useAuth();
	const navigate = useNavigate();
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		if (!token) {
			setFailed(true);
			return;
		}
		(async () => {
			try {
				const res = await fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`, {
					credentials: "include",
					redirect: "manual",
				});
				// A successful verify replies 302 (→ opaqueredirect here) after setting
				// the cookie; a bad/expired token replies 400.
				if (res.type !== "opaqueredirect" && !res.ok) throw new Error("verify failed");
				await refresh();
				if (!cancelled) navigate(PATHS.home, { replace: true });
			} catch {
				if (!cancelled) setFailed(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [token, refresh, navigate]);

	return (
		<div className="app">
			<div className="container page">
				{failed ? (
					<div className="state">
						<p className="state__title">That magic link didn't work</p>
						<p className="state__hint">
							It may have expired or already been used up. <Link to={PATHS.home}>Head home</Link> and
							request a new one.
						</p>
					</div>
				) : (
					<p className="state__title">Signing you in…</p>
				)}
			</div>
		</div>
	);
}
