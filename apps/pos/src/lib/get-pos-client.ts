import { createBrowserPreviewClient } from "./browser-preview-client";
import type { PosClient } from "./pos-client";
import { createTauriClient } from "./tauri-client";

export function isTauriRuntime(runtime: object): boolean {
  return "__TAURI_INTERNALS__" in runtime;
}

export function getPosClient(): PosClient {
  return isTauriRuntime(window)
    ? createTauriClient()
    : createBrowserPreviewClient();
}
