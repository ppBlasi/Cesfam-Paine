/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    user: {
      id: number;
      rut: string;
      isAdmin: boolean;
      isWorker: boolean;
      worker:
        | {
            id: number;
            estado: string;
            cargo: string;
            specialtyId: number | null;
            specialtyName: string | null;
          }
        | null;
    } | null;
  }
}
