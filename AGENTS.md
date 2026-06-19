# AGENTS.md

## Project
Build ShortLink SaaS based on docs/SRS.md.

## Rules
- Implement MVP only.
- Do not add Kubernetes, Kafka, Redis, EKS, EC2, GraphQL, or microservices.
- Backend: Python 3.13, FastAPI, Mangum, DynamoDB.
- Frontend: Next.js, TypeScript, Tailwind.
- Infrastructure: AWS CDK.
- DNS: Cloudflare DNS, not Route53.
- Use AWS CloudFront, S3, API Gateway, Lambda, DynamoDB, Cognito, SQS.
- Every feature must include tests.
- No business logic inside API route handlers.
- Use repository/service/domain structure.
- Use type hints.
- Use structured logging.
- Use ruff and pytest.

## Commands
- Backend test: `pytest`
- Backend lint: `ruff check .`
- Frontend test: `npm test`
- Frontend lint: `npm run lint`
