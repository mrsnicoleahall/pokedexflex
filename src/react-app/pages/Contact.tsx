// src/react-app/pages/Contact.tsx
//
// A simple contact form that emails the site admin (POST /api/contact). Sending
// requires sign-in (spam control), so signed-out visitors get a prompt instead
// of the form. The admin gets the message with the sender's email as reply-to.

import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { SignInPanel } from "../components/SignInPanel";
import { sendContact } from "../api";

export function Contact() {
	const { user } = useAuth();
	const [message, setMessage] = useState("");
	const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
	const [signInOpen, setSignInOpen] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!message.trim()) return;
		setStatus("sending");
		try {
			await sendContact(message.trim());
			setStatus("sent");
			setMessage("");
		} catch {
			setStatus("error");
		}
	}

	return (
		<div className="container page contact">
			<h1 className="hero__title hero__title--slim">Contact</h1>
			<p className="state__hint contact__intro">
				Found a bug, have a feature idea, or just want to say hi? Send a note straight to the person
				who builds PokéDexFlex.
			</p>

			{!user ? (
				<div className="state">
					<p className="state__title">Sign in to send a message</p>
					<p className="state__hint">Sending is sign-in-only to keep the spam bots out.</p>
					<button type="button" className="button button--primary" onClick={() => setSignInOpen(true)}>
						Sign in
					</button>
				</div>
			) : status === "sent" ? (
				<div className="state">
					<p className="state__title">Message sent 🎉</p>
					<p className="state__hint">
						Thanks! I'll reply to {user.email} if a response is needed.{" "}
						<button type="button" className="link-button" onClick={() => setStatus("idle")}>
							Send another
						</button>
					</p>
				</div>
			) : (
				<form className="contact__form" onSubmit={handleSubmit}>
					<label className="field-label" htmlFor="contact-message">
						Your message
					</label>
					<textarea
						id="contact-message"
						className="input input--full contact__textarea"
						rows={7}
						maxLength={4000}
						placeholder="What's on your mind?"
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						required
					/>
					<p className="state__hint">Replies go to {user.email}.</p>
					{status === "error" && (
						<p className="error-banner" role="alert">
							Couldn't send that. Please try again in a moment.
						</p>
					)}
					<button
						type="submit"
						className="button button--primary button--lg"
						disabled={status === "sending" || !message.trim()}
					>
						{status === "sending" ? "Sending…" : "Send message"}
					</button>
				</form>
			)}

			{signInOpen && <SignInPanel onClose={() => setSignInOpen(false)} />}
		</div>
	);
}
