try {
	const response = await fetch(process.argv[2], {
		signal: AbortSignal.timeout(2000),
	});
	if (!response.ok) process.exitCode = 1;
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
