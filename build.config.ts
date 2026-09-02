import { readdirSync } from "node:fs";

import { defineBuildConfig } from "obuild/config";

/**
 * One bundle: the four public entries plus every provider file as separate inputs. Each
 * provider becomes its own lazy chunk (`dist/providers/<name>.mjs`) that the built-in manifest
 * dynamic-imports on first create, so listing providers never loads their modules.
 *
 * The provider list is read from the directory instead of being hand-written, so a new provider
 * needs only its file and manifest entry, not a third place in this config.
 */
const providerInputs = readdirSync(new URL("./src/providers/", import.meta.url))
  .filter((file) => file.endsWith(".ts") && file !== "index.ts")
  .map((file) => `./src/providers/${file}`);

export default defineBuildConfig({
  entries: [
    {
      type: "bundle",
      input: ["./src/index.ts", "./src/cli.ts", "./src/mcp.ts", "./src/ai.ts", ...providerInputs],
    },
  ],
  hooks: {
    rolldownConfig(config) {
      // obuild 0.4.38's remove-comments plugin returns code without a sourcemap, which makes
      // Rolldown emit SOURCEMAP_BROKEN for every chunk. Drop it so the published maps parse.
      if (Array.isArray(config.plugins)) {
        config.plugins = config.plugins.filter((plugin) => {
          if (!plugin || typeof plugin !== "object" || !("name" in plugin)) return true;
          return (plugin as { name?: string }).name !== "remove-comments";
        });
      }
      return config;
    },
  },
});
