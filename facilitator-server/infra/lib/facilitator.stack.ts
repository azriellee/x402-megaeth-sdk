import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { X402FacilitatorService } from "./facilitator-service";

export interface X402FacilitatorStackProps extends StackProps {
  stage: string;
}

export class X402FacilitatorStack extends Stack {
  constructor(scope: Construct, id: string, props: X402FacilitatorStackProps) {
    super(scope, id, props);

    // eslint-disable-next-line no-new
    new X402FacilitatorService(this, "Service", {
      stage: props.stage,
    });
  }
}
