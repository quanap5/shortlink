# Deployment Guide

This is a development deployment guide for the ShortLink MVP skeleton.

## Prerequisites

- AWS account and configured AWS credentials.
- Node.js and npm.
- Docker running locally. CDK uses Docker to bundle the Python 3.13 Lambda artifact and install `backend/requirements.txt`.
- AWS CDK bootstrap completed for the target account and region.

## Build Frontend

```bash
cd frontend
npm install
npm run build
```

The static export is written to `frontend/out`.

## Install Infra Dependencies

```bash
cd infra
npm install
```

## Bootstrap AWS CDK

Run once per AWS account and region:

```bash
npx cdk bootstrap
```

## Synthesize

```bash
npm run synth
```

This validates the CloudFormation template and bundles the backend Lambda artifact with Python dependencies.

## Deploy

```bash
npx cdk deploy
```

After deploy, save these outputs:

- `CloudFrontDomainName`
- `HttpApiEndpoint`
- `UserPoolId`

## Cloudflare DNS

Use `docs/CLOUDFLARE_DNS.md` to create CNAME records in Cloudflare. Do not create Route53 hosted zones or Route53 DNS records.

## Smoke Checks

After deployment:

```bash
curl https://<HttpApiEndpoint>/health
```

Expected response:

```json
{"status":"ok"}
```

Then create a link through the API and verify the item appears in DynamoDB.

## Known MVP Gaps

- Cognito Hosted UI is used for login. See `docs/AUTH.md`.
- Click events are published to SQS, but the SQS consumer Lambda is not implemented yet.
- Frontend uses placeholder dashboard data and only auth is wired to Cognito.
- Custom domains and ACM certificates are intentionally out of scope for this phase.
