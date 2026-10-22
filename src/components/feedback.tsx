"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { FeedbackTotals, type Reaction } from "../domain/feedback.ts";
import {
	readFeedbackSelections,
	saveFeedbackSelections,
	type FeedbackVote,
} from "../infrastructure/browser-feedback.ts";

type Props = { subject: string; children?: ReactNode };
type FeedbackState =
	| { status: "loading" }
	| { status: "ready"; totals: FeedbackTotals }
	| { status: "unavailable" };

export function Feedback({ subject, children }: Props) {
	return (
		<FeedbackContent key={subject} subject={subject}>
			{children}
		</FeedbackContent>
	);
}

function FeedbackContent({ subject, children }: Props) {
	const [state, setState] = useState<FeedbackState>({ status: "loading" });
	const [attempt, setAttempt] = useState(0);
	const [choices, setChoices] = useState({ like: false, dislike: false });
	const [operations, setOperations] = useState<
		Partial<Record<Reaction, FeedbackVote>>
	>({});
	const [submitting, setSubmitting] = useState(false);
	const [message, setMessage] = useState("");
	const busy = useRef(false);
	const requestController = useRef<AbortController | undefined>(undefined);

	useEffect(() => {
		const controller = new AbortController();
		requestController.current = controller;
		async function load() {
			try {
				const response = await fetch(
					`/api/feedback?subject=${encodeURIComponent(subject)}`,
					{
						cache: "no-store",
						signal: AbortSignal.any([
							controller.signal,
							AbortSignal.timeout(5000),
						]),
					},
				);
				if (!response.ok) throw new Error("Feedback unavailable");
				const totals = FeedbackTotals.from(await response.json());
				if (!controller.signal.aborted) {
					const saved = readFeedbackSelections(subject);
					setChoices(saved.choices);
					setOperations(saved.operations);
					setState({ status: "ready", totals });
				}
			} catch {
				if (!controller.signal.aborted)
					setState({ status: "unavailable" });
			}
		}
		void load();
		return () => controller.abort();
	}, [subject, attempt]);

	async function vote(reaction: Reaction) {
		if (busy.current) return;
		busy.current = true;
		setSubmitting(true);
		setMessage("");
		const controller = requestController.current!;
		try {
			const next = operations[reaction] ?? {
				reaction,
				selected: !choices[reaction],
				operationId: crypto.randomUUID(),
			};
			saveFeedbackSelections(subject, {
				choices,
				operations: { ...operations, [reaction]: next },
			});
			setOperations((current) => ({ ...current, [reaction]: next }));
			const response = await fetch("/api/feedback", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ subject, ...next }),
				cache: "no-store",
				signal: AbortSignal.any([
					controller.signal,
					AbortSignal.timeout(8000),
				]),
			});
			if (!response.ok) throw new Error("Feedback unavailable");
			const totals = FeedbackTotals.from(await response.json());
			if (!controller.signal.aborted) {
				const nextChoices = {
					...choices,
					[next.reaction]: next.selected,
				};
				const nextOperations = { ...operations, [reaction]: undefined };
				saveFeedbackSelections(subject, {
					choices: nextChoices,
					operations: nextOperations,
				});
				setState({ status: "ready", totals });
				setChoices(nextChoices);
				setOperations(nextOperations);
			}
		} catch {
			if (!controller.signal.aborted) setMessage("Feedback unavailable.");
		} finally {
			if (!controller.signal.aborted) {
				busy.current = false;
				setSubmitting(false);
			}
		}
	}

	const totals = state.status === "ready" ? state.totals : undefined;
	const controls = (
		<section
			className="feedback"
			aria-label="Feedback"
			aria-busy={state.status === "loading" || submitting}
		>
			<div className="feedback__buttons">
				{(["like", "dislike"] as const).map((reaction) => (
					<button
						key={reaction}
						className="feedback__button"
						type="button"
						data-reaction={reaction}
						aria-label={reaction === "like" ? "Like" : "Dislike"}
						aria-pressed={choices[reaction]}
						disabled={state.status !== "ready" || submitting}
						onClick={() => void vote(reaction)}
					>
						{reaction === "like" ? (
							<ThumbsUp size={16} aria-hidden="true" />
						) : (
							<ThumbsDown size={16} aria-hidden="true" />
						)}
						<span>{reaction}</span>
						<span className="feedback__count">
							{totals
								? totals[
										reaction === "like"
											? "likes"
											: "dislikes"
									].toLocaleString("en-US")
								: "—"}
						</span>
					</button>
				))}
			</div>
			<div
				className="feedback__score"
				data-score={totals ? Math.sign(totals.score) : 0}
			>
				<span>
					{state.status === "unavailable" ? (
						<button
							type="button"
							aria-label="Retry feedback"
							onClick={() => {
								setState({ status: "loading" });
								setAttempt((current) => current + 1);
							}}
						>
							retry
						</button>
					) : (
						"net"
					)}
				</span>
				<output aria-label="Net feedback score">
					{totals ? totals.scoreText : "—"}
				</output>
			</div>
			<p className="feedback__status" role="status">
				{state.status === "loading"
					? "Loading feedback…"
					: state.status === "unavailable"
						? "Feedback unavailable."
						: message || (submitting ? "Sending feedback…" : "")}
			</p>
		</section>
	);
	return (
		<>
			{controls}
			{children}
			{children !== undefined && controls}
		</>
	);
}
