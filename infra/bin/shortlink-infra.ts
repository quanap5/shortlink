#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ShortLinkStack } from "../lib/shortlink-stack";

const app = new cdk.App();

new ShortLinkStack(app, "ShortLinkStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
