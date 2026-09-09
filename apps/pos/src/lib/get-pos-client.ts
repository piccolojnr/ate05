import { createBrowserPreviewClient } from "./browser-preview-client";
import type { PosClient } from "./pos-client";
import { createTauriClient } from "./tauri-client";

export function getPosClient(): PosClient {
  return "__TAURI_INTERNALS__" in window
    ? createTauriClient()
    : createBrowserPreviewClient();
}
