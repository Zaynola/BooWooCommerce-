#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BmoWooCommerceStack } from '../lib/bmo-woo_commerce-stacks';
import { App } from 'aws-cdk-lib';
//import { Stack, App } from 'aws-cdk-lib';

const app = new App();
if (process.env.CDK_DEFAULT_ACCOUNT && process.env.CDK_DEFAULT_REGION) {
  new BmoWooCommerceStack(app, 'BmoWooCommerceStack', {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  });
} else {
  console.error('CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION environment variables must be set.');
  process.exit(1);
}

app.synth();