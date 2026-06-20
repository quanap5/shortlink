<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=220&color=0:167A7F,100:17202A&text=ShortLink&fontColor=ffffff&fontSize=64&fontAlignY=38&desc=Serverless%20short%20links%20for%20tenant-scoped%20workspaces&descAlignY=58&descSize=18" alt="ShortLink hero banner" />
</p>

<p align="center">
  <a href="./backend/pyproject.toml"><img alt="Python 3.13" src="https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white" /></a>
  <a href="./frontend/package.json"><img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white" /></a>
  <a href="./infra/package.json"><img alt="AWS CDK" src="https://img.shields.io/badge/AWS%20CDK-v2-FF9900?logo=amazonaws&logoColor=white" /></a>
  <img alt="Backend tests" src="https://img.shields.io/badge/pytest-passing-2f9e44?logo=pytest&logoColor=white" />
  <img alt="DNS" src="https://img.shields.io/badge/DNS-Cloudflare%20not%20Route53-F38020?logo=cloudflare&logoColor=white" />
</p>

# ShortLink

ShortLink is a serverless SaaS app for creating, managing, redirecting, and tracking tenant-scoped short links. It uses FastAPI on AWS Lambda, DynamoDB for storage, SQS for click events, Next.js for the dashboard, and AWS CDK for infrastructure. DNS is managed through Cloudflare instead of Route53.

Production URLs:

- App and short links: [https://link.twinqx.com](https://link.twinqx.com)
- Branded auth: [https://auth.twinqx.com](https://auth.twinqx.com)
- API Gateway: `https://6fxgd9257b.execute-api.ap-northeast-2.amazonaws.com`

## Stack

- Backend: Python 3.13, FastAPI, Mangum, Pydantic v2, DynamoDB abstractions.
- Frontend: Next.js, TypeScript, Tailwind.
- Infrastructure: AWS CDK, Lambda, API Gateway, DynamoDB, SQS, Cognito, S3, CloudFront.
- DNS: Cloudflare DNS. Route53 is intentionally out of scope.

## Features

- Register a tenant workspace and verify the owner email.
- Sign in through a branded hosted auth domain.
- Create short links from public HTTP/HTTPS URLs.
- Support auto-generated or custom slugs.
- Validate unsafe URLs, private IPs, localhost, and internal hostnames.
- Configure link status, expiration, redirect type, and tags.
- Redirect `https://link.twinqx.com/{slug}` to the original URL.
- Track clicks, daily activity, device/browser hints, and coarse location data.
- View dashboard metrics, link lists, sorting, pagination, and analytics.

## Repository

```text
backend/   FastAPI application, services, repositories, and pytest tests
frontend/  Next.js dashboard and hosted auth callback pages
infra/     AWS CDK TypeScript stack
docs/      SRS, architecture notes, Cloudflare DNS, and deployment guide
```

## Commands

Backend:

```bash
cd backend
pytest
ruff check .
```

Frontend:

```bash
cd frontend
npm install
npm test
npm run build
npm run lint
```

Infrastructure:

```bash
cd infra
npm install
npm run build
npm run synth
npx cdk deploy --require-approval never
```

## Deployment

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) and [docs/CLOUDFLARE_DNS.md](./docs/CLOUDFLARE_DNS.md) for deployment and DNS details.

High-level flow:

```text
Cloudflare DNS
  -> CloudFront custom domain
  -> S3 static frontend and API Gateway routes
  -> Lambda FastAPI backend
  -> DynamoDB tables and SQS click queue
```

## Scope Guardrails

Included:

- Tenant-scoped link creation, redirect, and analytics.
- Tenant registration and branded hosted auth.
- Click event ingestion through SQS.
- CDK-defined AWS infrastructure.
- Cloudflare DNS for app and auth domains.

Not included:

- Billing.
- Per-customer custom short domains.
- Enterprise SSO.
- Kubernetes, Kafka, Redis, EKS, EC2, GraphQL, or microservices.

## License

This project is licensed under the MIT License.
