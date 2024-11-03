import { defineManifest } from "@crxjs/vite-plugin";
import packageData from "../package.json";

//@ts-ignore
const isDev = process.env.NODE_ENV == "development";

export default defineManifest({
  name: `${packageData.displayName}${isDev ? "-dev" : ""}`,
  description: packageData.description,
  version: packageData.version,
  manifest_version: 3,
  icons: {
    16: "img/icon16.png",
    32: "img/icon32.png",
    48: "img/icon48.png",
    128: "img/icon128.png",
  },
  content_scripts: [
    {
      all_frames: true,
      run_at: "document_end",
      matches: ["<all_urls>"],
      js: ["src/contentScript/index.ts"],
    },
  ],
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  web_accessible_resources: [
    {
      resources: [
        "img/icon16.png",
        "img/icon32.png",
        "img/icon48.png",
        "img/icon128.png",
      ],
      matches: [],
    },
  ],
});
