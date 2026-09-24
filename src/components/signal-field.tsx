"use client";

import { useEffect, useRef } from "react";
import { startSignalField } from "./signal-field-animation";

export function SignalField() {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		return startSignalField(canvas);
	}, []);

	return (
		<canvas className="signal-field" ref={canvasRef} aria-hidden="true" />
	);
}
