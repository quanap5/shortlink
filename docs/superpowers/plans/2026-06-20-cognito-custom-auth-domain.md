# Cognito Custom Auth Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible Amazon Cognito hosted-login domain with `https://auth.twinqx.com` while keeping the secure Cognito OAuth Authorization Code + PKCE flow.

**Architecture:** Keep Cognito Hosted UI/managed login as the identity provider, but configure a Cognito custom user-pool domain backed by an ACM certificate in `us-east-1`. CDK will emit `auth-config.json` with `https://auth.twinqx.com`, and Cloudflare will host the CNAME record that points `auth.twinqx.com` to the Cognito-provided CloudFront alias target.

**Tech Stack:** AWS CDK, Cognito User Pool Domain, ACM certificate in `us-east-1`, Cloudflare DNS, Next.js static frontend, existing OAuth PKCE auth helpers.

---

## Current State

- Frontend URL: `https://link.twinqx.com`
- Current Cognito domain in `auth-config.json`: `https://shortlink-373249432962-ap-northeast-2.auth.ap-northeast-2.amazoncognito.com`
- Desired Cognito domain: `https://auth.twinqx.com`
- Current CDK file: `infra/lib/shortlink-stack.ts`
- Current context file: `infra/cdk.json`
- DNS provider: Cloudflare, not Route53

---

## Phase 1: Prepare DNS and Certificate

- [ ] **Step 1: Request ACM certificate in `us-east-1`**

Create/request a public ACM certificate for:

```text
auth.twinqx.com
```

Important: Cognito custom domains require an ACM certificate in `us-east-1`, even though the user pool is in `ap-northeast-2`.

- [ ] **Step 2: Add ACM validation record in Cloudflare**

After requesting the cert, ACM provides a DNS validation CNAME. Add it to Cloudflare exactly as ACM shows.

Expected result:

```text
ACM certificate status: Issued
Region: us-east-1
Domain: auth.twinqx.com
```

- [ ] **Step 3: Record certificate ARN**

Save ARN into `infra/cdk.json` later as:

```json
"authDomainName": "auth.twinqx.com",
"authCertificateArn": "arn:aws:acm:us-east-1:373249432962:certificate/..."
```

---

## Phase 2: Update CDK Auth Domain

**Files:**
- Modify: `infra/cdk.json`
- Modify: `infra/lib/shortlink-stack.ts`
- Modify: `docs/CLOUDFLARE_DNS.md`
- Modify: `docs/AUTH.md`

- [ ] **Step 1: Add CDK context keys**

In `infra/cdk.json`, add:

```json
"authDomainName": "auth.twinqx.com",
"authCertificateArn": "arn:aws:acm:us-east-1:373249432962:certificate/REPLACE_WITH_ISSUED_CERT"
```

- [ ] **Step 2: Update `UserPoolDomain` creation**

In `infra/lib/shortlink-stack.ts`, read context:

```ts
const authDomainName = this.node.tryGetContext("authDomainName") as string | undefined;
const authCertificateArn = this.node.tryGetContext("authCertificateArn") as string | undefined;
```

Create Cognito custom domain when both values exist:

```ts
const userPoolDomain = authDomainName && authCertificateArn
  ? new cognito.UserPoolDomain(this, "UserPoolDomain", {
      userPool,
      customDomain: {
        domainName: authDomainName,
        certificate: acm.Certificate.fromCertificateArn(
          this,
          "AuthDomainCertificate",
          authCertificateArn,
        ),
      },
    })
  : new cognito.UserPoolDomain(this, "UserPoolDomain", {
      userPool,
      cognitoDomain: {
        domainPrefix: `shortlink-${this.account}-${this.region}`,
      },
    });
```

- [ ] **Step 3: Compute auth base URL**

Add:

```ts
const cognitoBaseUrl = authDomainName
  ? `https://${authDomainName}`
  : `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`;
```

Use `cognitoBaseUrl` in:

```ts
auth-config.json -> cognitoDomain
CognitoDomain output
CognitoLoginUrl output
```

- [ ] **Step 4: Add CloudFormation output for DNS target**

Add output:

```ts
new cdk.CfnOutput(this, "AuthCustomDomainName", {
  value: authDomainName ?? userPoolDomain.domainName,
});
```

If CDK exposes the Cognito CloudFront alias target directly, output it. If not, use the AWS console after deploy to copy the alias target from Cognito domain details.

---

## Phase 3: Deploy and Add Cloudflare DNS

- [ ] **Step 1: Deploy CDK**

Run:

```powershell
cd infra
npm.cmd run build
npx.cmd cdk deploy --require-approval never
```

Expected:

```text
ShortLinkStack UPDATE_COMPLETE
```

- [ ] **Step 2: Get Cognito custom domain alias target**

From AWS Console:

```text
Cognito > User pools > ShortLink user pool > Branding > Domain
Custom domain: auth.twinqx.com
Alias target: xxxxx.cloudfront.net
```

- [ ] **Step 3: Add Cloudflare DNS record**

Create:

```text
Type: CNAME
Name: auth
Target: <Cognito alias target CloudFront domain>
Proxy status: DNS only
TTL: Auto
```

Use DNS-only first. Cognito custom domain validation/CloudFront behavior is cleaner without Cloudflare proxy.

- [ ] **Step 4: Wait for propagation**

AWS docs note custom domain changes can take several minutes. Wait until:

```text
https://auth.twinqx.com/oauth2/authorize?... 
```

loads the hosted sign-in page.

---

## Phase 4: Frontend Copy Cleanup

**Files:**
- Modify: `frontend/app/login/page.tsx`
- Modify: `frontend/app/auth/callback/page.tsx`
- Modify: `frontend/lib/auth.ts`
- Modify: `frontend/tests/dashboard-icons.test.mjs`

- [ ] **Step 1: Remove visible Cognito wording**

Change user-facing text:

```text
Ready to sign in with Cognito. -> Ready to sign in.
Redirecting to Cognito... -> Opening secure sign in...
Sign in with Cognito -> Sign in
Auth callback -> Completing sign in
```

- [ ] **Step 2: Hide technical token errors from users**

Keep technical detail internal, but show friendly message:

```text
We could not complete sign in. Please try again.
```

- [ ] **Step 3: Add frontend source tests**

Add tests that assert:

```text
login page does not contain Cognito
callback page does not contain Auth callback
auth helper still contains cognitoDomain only as config key, not user-facing copy
```

---

## Phase 5: Verification

- [ ] **Step 1: Verify auth config**

Run:

```powershell
curl.exe -s https://link.twinqx.com/auth-config.json
```

Expected:

```json
"cognitoDomain":"https://auth.twinqx.com"
```

- [ ] **Step 2: Verify login redirect**

Open:

```text
https://link.twinqx.com/login
```

Click `Sign in`.

Expected browser URL:

```text
https://auth.twinqx.com/oauth2/authorize...
```

- [ ] **Step 3: Verify callback**

Login with an existing verified tenant user.

Expected:

```text
Signed in.
Continue -> /links
```

- [ ] **Step 4: Verify API auth still works**

After login:

```text
/links loads tenant links
/links/create can create a link
/dashboard/analytics loads analytics
```

---

## Rollback Plan

If `auth.twinqx.com` fails:

1. Remove `authDomainName` and `authCertificateArn` from `infra/cdk.json`.
2. Deploy CDK.
3. `auth-config.json` returns to the Cognito prefix domain.
4. Leave Cloudflare `auth` record disabled or delete it.

---

## Notes

- This does not replace Cognito. It hides AWS/Cognito branding in the browser URL and user-facing UI while keeping Cognito security.
- Use Cloudflare DNS only; do not create Route53 resources.
- Cognito custom domain requires an ACM certificate in `us-east-1`.
