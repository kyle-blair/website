"use client";

import { useEffect, useRef } from "react";
import { startSignalField } from "./signal-field-animation.ts";

export function SignalField() {
	const fieldRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const field = fieldRef.current;
		if (!field) return;
		return startSignalField(field);
	}, []);

	return <div className="signal-field" ref={fieldRef} aria-hidden="true" />;
}
