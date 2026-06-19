# Cloudflare DNS Records

ShortLink uses Cloudflare DNS for MVP domain management. Do not create Route53 hosted zones or DNS records.

## Required Records

Add these records in Cloudflare after the CDK stack is deployed.

```text
Type: CNAME
Name: www
Value: <CloudFrontDomainName output>
Proxy status: DNS only or Proxied, depending on TLS validation needs
```

```text
Type: CNAME
Name: api
Value: <HttpApiEndpoint host or custom API target when configured>
Proxy status: DNS only
```

```text
Type: CNAME
Name: short
Value: <CloudFrontDomainName output>
Proxy status: DNS only or Proxied, depending on redirect behavior
```

## AWS ACM Validation

When adding a custom certificate in a later phase, create the CNAME validation records from AWS ACM in Cloudflare.

Cloudflare SSL mode should be `Full`. Avoid `Flexible` because it can cause redirect loops and weaker origin security.
