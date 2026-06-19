# Cloudflare DNS Records

ShortLink uses Cloudflare DNS for MVP domain management. Do not create Route53 hosted zones or DNS records.

## Frontend Custom Domain

ShortLink is configured to use:

```text
https://link.twinqx.com
```

CloudFront still has the AWS-generated domain:

```text
djg0fa4zryeod.cloudfront.net
```

After the ACM certificate is issued and CDK deploy completes, create this record in Cloudflare:

```text
Type: CNAME
Name: link
Value: djg0fa4zryeod.cloudfront.net
Proxy status: DNS only
```

Keep this record `DNS only` until the site, Cognito callback, and TLS are confirmed working.

## ACM Certificate Validation

The CloudFront certificate must be in AWS ACM `us-east-1`.

Current certificate ARN:

```text
arn:aws:acm:us-east-1:373249432962:certificate/fe7b83cf-bfec-40de-960e-f89bc1876860
```

Add this DNS validation record in Cloudflare:

```text
Type: CNAME
Name: _d3d546ba28cdba9ed3fcbafd41bef4ac.link
Value: _f97878e00ee6b1e1456cf24fd15ef5f7.jkddzztszm.acm-validations.aws
Proxy status: DNS only
```

Wait until ACM status becomes `Issued` before running `cdk deploy`.

## Legacy MVP Records

These were earlier examples for generic MVP DNS. The active frontend record for this deployment is `link`.

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

## Short Redirect Routing

The frontend and public short redirects both use `https://link.twinqx.com`.

CloudFront routes known frontend paths such as `/login`, `/links`, `/analytics`, `/auth/*`, and static assets to S3. Other root paths such as `/my-slug` route to the API Gateway redirect endpoint.
