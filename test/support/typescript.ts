import { readFileSync } from "node:fs";
import {
	createRequire,
	registerHooks,
	setSourceMapsSupport,
} from "node:module";

const require = createRequire(import.meta.url);

setSourceMapsSupport(true);
registerHooks({
	load(url, context, nextLoad) {
		if (!url.endsWith(".tsx")) return nextLoad(url, context);
		const typescript = require("typescript") as typeof import("typescript");
		return {
			format: "module",
			shortCircuit: true,
			source: typescript.transpileModule(
				readFileSync(new URL(url), "utf8"),
				{
					fileName: new URL(url).pathname,
					compilerOptions: {
						target: typescript.ScriptTarget.ES2022,
						module: typescript.ModuleKind.ESNext,
						jsx: typescript.JsxEmit.ReactJSX,
						inlineSourceMap: true,
						inlineSources: true,
					},
				},
			).outputText,
		};
	},
});
