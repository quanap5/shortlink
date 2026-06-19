<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=220&color=0:167A7F,100:17202A&text=ShortLink&fontColor=ffffff&fontSize=64&fontAlignY=38&desc=Serverless%20SaaS%20MVP%20for%20tenant-scoped%20short%20links&descAlignY=58&descSize=18" alt="ShortLink hero banner" />
</p>

<p align="center">
  <a href="./backend/pyproject.toml"><img alt="Python 3.13" src="https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white" /></a>
  <a href="./frontend/package.json"><img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white" /></a>
  <a href="./infra/package.json"><img alt="AWS CDK" src="https://img.shields.io/badge/AWS%20CDK-v2-FF9900?logo=amazonaws&logoColor=white" /></a>
  <img alt="Backend tests" src="https://img.shields.io/badge/pytest-passing-2f9e44?logo=pytest&logoColor=white" />
  <img alt="DNS" src="https://img.shields.io/badge/DNS-Cloudflare%20not%20Route53-F38020?logo=cloudflare&logoColor=white" />
</p>

# ShortLink

ShortLink is a serverless SaaS MVP for creating and managing tenant-scoped short links. It uses FastAPI on AWS Lambda, DynamoDB for storage, SQS for click events, Next.js for the dashboard, and AWS CDK for infrastructure. DNS is managed through Cloudflare instead of Route53.

## Stack

- Backend: Python 3.13, FastAPI, Mangum, Pydantic v2, DynamoDB abstractions.
- Frontend: Next.js, TypeScript, Tailwind.
- Infrastructure: AWS CDK, Lambda, API Gateway, DynamoDB, SQS, Cognito, S3, CloudFront.
- DNS: Cloudflare DNS. Route53 is intentionally out of scope for the MVP.

## Repository

```text
backend/   FastAPI application, services, repositories, and pytest tests
frontend/  Next.js dashboard skeleton
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
npm run build
npm run lint
```

Infrastructure:

```bash
cd infra
npm install
npm run build
npm run synth
```

## Deployment

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for the development deployment flow.

High-level flow:

```text
Cloudflare DNS
  -> CloudFront
  -> S3 frontend / API Gateway
  -> Lambda FastAPI
  -> DynamoDB + SQS
```

## MVP Scope

Included:

- Tenant-scoped link creation and redirect service boundaries.
- Click event publishing through SQS.
- CDK-defined AWS infrastructure.
- Cloudflare DNS documentation.

Not included:

- Billing.
- Custom domains.
- Enterprise SSO.
- Kubernetes, Kafka, Redis, EKS, EC2, GraphQL, or microservices.

## License

This project is licensed under the MIT License.
