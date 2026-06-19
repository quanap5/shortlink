# ShortLink Frontend

Next.js TypeScript dashboard skeleton for the MVP.

## Commands

```bash
npm run dev
npm run lint
npm test
```

Phase 1 uses static placeholder data. Phase 2 should connect Cognito and the FastAPI backend.

The infrastructure stack deploys the static export from `frontend/out`, so run `npm run build` before CDK synth/deploy.
