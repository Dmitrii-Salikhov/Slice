/// <reference types="vite/client" />

import type { SliceApi } from '../electron/api';

declare global {
  interface Window {
    slice?: SliceApi;
  }
}

export {};
