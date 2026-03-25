#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { X402FacilitatorStack } from "../lib/facilitator.stack";

const app = new App();

// eslint-disable-next-line no-new
new X402FacilitatorStack(app, "X402FacilitatorService", {
  env: {
    region: "ap-southeast-1",
    account: "276671279160",
  },
  stage: "Development",
});
