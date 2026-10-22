import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	agentRules: false,
	poweredByHeader: false,
	output: "standalone",
	outputFileTracingIncludes: { "/*": ["./src/app/blog/**/*.md"] },
};

export default nextConfig;
