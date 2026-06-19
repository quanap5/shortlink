# ShortLink Infrastructure

AWS CDK TypeScript skeleton for the MVP.

## Resources

- S3 bucket for exported frontend assets
- CloudFront distribution
- API Gateway HTTP API
- Lambda for FastAPI through Mangum
- DynamoDB tables for links and click events
- SQS click events queue
- Cognito user pool

Route53 is intentionally not used. DNS records should be managed in Cloudflare.

## Commands

```bash
npm install
cd ../frontend && npm install && npm run build
cd ../infra
npm run build
npm run synth
```

`npm run synth` expects:

- Docker running for Python Lambda bundling.
- The static frontend export to exist at `../frontend/out`.

See `../docs/DEPLOYMENT.md` for the full deployment flow.
