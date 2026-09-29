import { resolve } from "node:path";
import { urlsTheme } from "./shiki-theme";

/** Bundled from the checkout's sources: a deploy needs neither dist/ nor the root node_modules. */
const repoRoot = resolve(import.meta.dirname, "..");

export default defineNuxtConfig({
  extends: ["docus"],
  /** The repo root is its own pnpm workspace, so Nuxt must not treat it as this site's. */
  workspaceDir: import.meta.dirname,
  alias: {
    "@agntn/urls": resolve(repoRoot, "src/index.ts"),
  },
  /** The browser loads the library from ../src and the version from ../package.json. */
  vite: {
    server: {
      fs: {
        allow: [repoRoot],
      },
    },
  },
  devtools: { enabled: false },
  telemetry: false,
  site: {
    url: "https://urls.agntn.dev",
    name: "@agntn/urls",
  },
  llms: {
    domain: "https://urls.agntn.dev",
    title: "@agntn/urls",
    description:
      "Passive URL discovery over web archives and threat intel indexes, as a library, a CLI, an MCP server and Pi and OMP extensions.",
    sections: [
      {
        title: "Explorer",
        description: "Run urls_discover through the docs worker and read the text an agent gets back.",
        links: [
          {
            title: "URL explorer",
            href: "https://urls.agntn.dev/discover",
          },
        ],
      },
    ],
  },
  /** Docus pages define their own OG images; the alt text is the one thing they leave unset. */
  ogImage: {
    defaults: {
      alt: "@agntn/urls: every URL a domain left behind",
    },
  },
  /** Docus scans app/ for icon names; this list adds the ones built from data at runtime. */
  icon: {
    clientBundle: {
      icons: [
        "lucide:database",
        "lucide:landmark",
        "lucide:mountain-snow",
        "lucide:scan-search",
        "lucide:shield-alert",
        "simple-icons:internetarchive",
        "simple-icons:virustotal",
      ],
    },
  },
  colorMode: {
    preference: "dark",
  },
  app: {
    head: {
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
      ],
      meta: [
        { name: "theme-color", content: "#0b0d10" },
        { name: "apple-mobile-web-app-title", content: "urls" },
        { name: "author", content: "oritwoen" },
        { property: "og:locale", content: "en_US" },
      ],
    },
  },
  /** Docus ships an MCP endpoint that needs the Cloudflare Agents SDK on Workers. The docs do not need it. */
  mcp: {
    enabled: false,
  },
  nitro: {
    preset: "cloudflare_module",
    compatibilityDate: "2026-09-03",
    prerender: {
      crawlLinks: true,
      routes: ["/", "/discover", "/sitemap.xml", "/robots.txt", "/llms.txt", "/llms-full.txt"],
      ignore: ["/api"],
    },
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },
  compatibilityDate: "2026-09-03",
  /** In production the response cache and the rate counter live in KV, so they survive isolates. */
  $production: {
    nitro: {
      storage: {
        cache: {
          driver: "cloudflare-kv-binding",
          binding: "CACHE",
        },
      },
    },
  },
  /** Fonts live in public/fonts and app/assets/fonts.css, which is the only place nuxt-og-image reads them from. */
  css: ["~/assets/fonts.css"],
  fonts: {
    families: [
      { name: "Figtree", provider: "local", weights: [400, 500] },
      { name: "Fira Code", provider: "local", weights: [400, 500] },
    ],
  },
  content: {
    database: {
      type: "d1",
      bindingName: "DB",
    },
    build: {
      markdown: {
        highlight: {
          theme: {
            default: urlsTheme,
            light: urlsTheme,
            dark: urlsTheme,
          },
        },
      },
    },
  },
});
