# Image Site

A React + Vite image generation workspace with a Node backend, OpenAI-compatible image endpoints, prompt optimization, and persisted generation jobs.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

The frontend dev server runs through Vite. For the Node backend, set the required environment variables from `.env.example` and run:

```bash
npm run serve
```

## Required Secrets

Do not commit real values for these variables:

- `SUB2API_DB_PASSWORD`
- `IMAGE_SITE_AUTH_SECRET`

Local runtime data, deployment state, cache folders, generated archives, and tool-specific local settings are ignored by Git.

## Scripts

```bash
npm run build
npm run lint
npm run serve
```
