import { defineBuildConfig } from "obuild/config";

export default defineBuildConfig({
  // One bundle, four inputs: the entries share the chunk that holds the
  // provider registry. Separate bundles would each carry their own copy, so a
  // provider registered through the package entrypoint would be invisible to
  // the MCP server and the AI tools.
  entries: [
    {
      type: "bundle",
      input: ["./src/index.ts", "./src/cli.ts", "./src/mcp.ts", "./src/ai.ts"],
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
