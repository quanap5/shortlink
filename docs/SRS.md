# ShortLink SaaS - SRS Update: Cloudflare DNS

## Infrastructure Decision

Use Cloudflare DNS instead of AWS Route53 for MVP.

Reason:

- Free DNS management
- Easy domain configuration
- Good startup-friendly option
- Can still point traffic to AWS CloudFront, API Gateway, or Lambda
- Avoid Route53 hosted zone monthly cost during MVP stage

## Updated Architecture

```
User
 ↓
Cloudflare DNS
 ↓
AWS CloudFront
 ↓
Frontend S3 / Backend API Gateway
 ↓
Lambda
 ↓
DynamoDB
```

## Updated AWS Components

Use:

```
AWS S3
AWS CloudFront
AWS ACM
AWS API Gateway
AWS Lambda
AWS DynamoDB
AWS Cognito
AWS SQS
AWS CloudWatch
```

Do not use for MVP:

```
AWS Route53
```

## Domain Management

Domain can be purchased from:

```
Porkbun
Namecheap
GoDaddy
Cloudflare Registrar
```

DNS nameservers should be managed by:

```
Cloudflare DNS
```

Example records:

```
Type: CNAME
Name: www
Value: CloudFront distribution domain

Type: CNAME
Name: api
Value: API Gateway custom domain

Type: CNAME
Name: short
Value: CloudFront distribution domain
```

## SSL/TLS

Use:

```
AWS ACM certificate for CloudFront
Cloudflare DNS validation records
```

Cloudflare SSL mode:

```
Full
```

Avoid:

```
Flexible
```

Reason:

Flexible SSL can cause redirect loops and weaker origin security.

## MVP Cost Optimization

For MVP, prefer:

```
DNS: Cloudflare DNS
Frontend: S3 + CloudFront
Backend: API Gateway + Lambda
Database: DynamoDB On-Demand
Queue: SQS
Logs: CloudWatch
```

## Out of Scope for MVP

Do not implement:

```
Route53
Kubernetes
EKS
EC2 server hosting
Multi-region routing
Global Accelerator
Complex CDN logic
```

## Updated Coding Agent Instruction

When generating infrastructure code:

- Do not create Route53 hosted zone
- Do not create Route53 DNS records
- Create CloudFront distribution
- Output required DNS records for Cloudflare manually
- Use ACM DNS validation
- Document which CNAME/TXT records must be added in Cloudflare

END
