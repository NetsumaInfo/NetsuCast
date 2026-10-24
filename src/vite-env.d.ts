/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** TMDB API key, from .env.local (never committed). */
  readonly VITE_TMDB_KEY?: string;
}
