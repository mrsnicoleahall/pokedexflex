// src/react-app/components/SignInPanel.tsx
//
// Modal for requesting a passwordless sign-in link. On submit it calls the
// `/api/auth/request-link` endpoint; in dev (no real email sender wired up)
// the response includes `devLink`, which we render as a clickable link that
// performs a normal navigation to `/api/auth/verify?token=…`. That endpoint
// sets the session cookie and redirects back to `/`, where AuthProvider's
// mount-time `refresh()` picks up the now-signed-in session.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";

type SignInPanelProps = {
	onClose: () => void;
};

export function SignInPanel({ onClose }: SignInPanelProps) {
	const { requestLink, refresh } = useAuth();
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<"idle" | "sending" | "sent" | "verifying">("idle");
	const [devLink, setDevLink] = useState<string | undefined>(undefined);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!email.trim()) return;
		setStatus("sending");
		setError(null);
		try {
			const result = await requestLink(email.trim());
			setDevLink(result.devLink);
			setStatus("sent");
		} catch {
			setStatus("idle");
			setError("Couldn't send the sign-in link. Please try again.");
		}
	}

	// Complete the dev sign-in by fetching the verify endpoint (which sets the
	// session cookie) rather than a full-page navigation — the latter can be
	// intercepted by the dev server's SPA fallback. Then refresh the session.
	async function handleDevVerify() {
		if (!devLink) return;
		setStatus("verifying");
		setError(null);
		try {
			await fetch(devLink, { credentials: "include", redirect: "manual" });
			await refresh();
			onClose();
		} catch {
			setStatus("sent");
			setError("Couldn't complete sign-in. Please try again.");
		}
	}

	return createPortal(
		<div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
			<div
				className="modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="signin-title"
				ref={dialogRef}
			>
				<div className="modal__header">
					<h2 id="signin-title" className="modal__title">
						Sign in
					</h2>
					<button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
						✕
					</button>
				</div>

				{status === "sent" || status === "verifying" ? (
					<div className="modal__body">
						{devLink ? (
							<>
								<p>Dev sign-in link ready:</p>
								<button
									type="button"
									className="button button--primary"
									onClick={handleDevVerify}
									disabled={status === "verifying"}
								>
									{status === "verifying" ? "Signing in…" : "Sign in →"}
								</button>
							</>
						) : (
							<p>Check your email for a sign-in link.</p>
						)}
					</div>
				) : (
					<form className="modal__body" onSubmit={handleSubmit}>
						<label className="field-label" htmlFor="signin-email">
							Email address
						</label>
						<input
							ref={inputRef}
							id="signin-email"
							className="input input--full"
							type="email"
							required
							placeholder="you@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
						{error && (
							<p className="error-banner" role="alert">
								{error}
							</p>
						)}
						<button type="submit" className="button button--primary" disabled={status === "sending"}>
							{status === "sending" ? "Sending…" : "Send sign-in link"}
						</button>
					</form>
				)}
			</div>
		</div>,
		document.body,
	);
}
