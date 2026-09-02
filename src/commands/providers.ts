/** List registered providers and their capabilities */
import { defineCommand } from "citty";
import consola from "consola";
import { formatProviders } from "../core/format.ts";
import { listProviders } from "../core/registry.ts";

export default defineCommand({
  meta: {
    name: "providers",
    description: "List registered urls sources and capabilities",
  },
  async run() {
    consola.log(formatProviders(listProviders()));
    consola.log("");
    consola.info(
      "Use --provider <name> to select a specific source, or --provider all to fan out to every source",
    );
  },
});
