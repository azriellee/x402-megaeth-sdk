import { Construct } from "constructs";
import {
  Fn,
  Duration,
  RemovalPolicy,
  CfnOutput,
} from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as path from "path";

export interface X402FacilitatorServiceProps {
  stage: string;
}

export class X402FacilitatorService extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: X402FacilitatorServiceProps
  ) {
    super(scope, id);

    const { stage } = props;
    const serviceStage = stage.toLowerCase();

    // ──────────────────────────────────────────────
    // Import shared VPC (same pattern as okx-rfq-service)
    // ──────────────────────────────────────────────
    const vpc = ec2.Vpc.fromVpcAttributes(this, "ImportedVpc", {
      vpcId: Fn.importValue("ElasticVPCId"),
      vpcCidrBlock: Fn.importValue("ElasticVPCCidrBlock"),
      availabilityZones: Fn.split(
        ",",
        Fn.importValue("ElasticAvailabilityZones")
      ),
      publicSubnetIds: Fn.split(",", Fn.importValue("PublicSubnetIds")),
      isolatedSubnetIds: Fn.split(",", Fn.importValue("IsolatedSubnetIds")),
    });

    const sharedSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "ImportedSG",
      Fn.importValue("ElasticSecurityGroupId")
    );

    // Redis endpoint from shared-service ElastiCache
    const redisEndpoint = Fn.importValue("ElasticRedisEndpoint");

    // ──────────────────────────────────────────────
    // Secrets Manager — facilitator private key
    // ──────────────────────────────────────────────
    const facilitatorSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "FacilitatorSecret",
      "development/x402/facilitator-key"
    );

    // ──────────────────────────────────────────────
    // DynamoDB Tables
    // ──────────────────────────────────────────────

    // Table 1: Replay protection for native ETH payments
    const txHashesTable = new dynamodb.Table(this, "UsedTxHashes", {
      tableName: `${serviceStage}-x402-used-tx-hashes`,
      partitionKey: { name: "txHash", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Table 2: Permit tracking (pending/processed/failed)
    const permitsTable = new dynamodb.Table(this, "ProcessedPermits", {
      tableName: `${serviceStage}-x402-processed-permits`,
      partitionKey: { name: "sigKey", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Table 3: Settlement stats (single-table design)
    const statsTable = new dynamodb.Table(this, "SettlementStats", {
      tableName: `${serviceStage}-x402-settlement-stats`,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // GSI: inverted keys for querying all stats by date
    statsTable.addGlobalSecondaryIndex({
      indexName: "sk-pk-index",
      partitionKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "pk", type: dynamodb.AttributeType.STRING },
    });

    // ──────────────────────────────────────────────
    // ECS Cluster + Fargate Service
    // ──────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: `${serviceStage}-x402-facilitator`,
    });

    const logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: `/ecs/${serviceStage}-x402-facilitator`,
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDef", {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    const container = taskDefinition.addContainer("facilitator", {
      image: ecs.ContainerImage.fromAsset(
        path.resolve(__dirname, "../../../"),
        {
          file: "facilitator-server/Dockerfile",
          exclude: [
            "cdk.out",
            "**/cdk.out",
            "**/node_modules",
            ".git",
            "frontend-demo",
            "demo",
          ],
        }
      ),
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: "facilitator",
      }),
      environment: {
        PORT: "3403",
        REDIS_URL: redisEndpoint,
        TX_HASHES_TABLE: txHashesTable.tableName,
        PERMITS_TABLE: permitsTable.tableName,
        STATS_TABLE: statsTable.tableName,
        SECRET_NAME: "development/x402/facilitator-key",
      },
      healthCheck: {
        command: [
          "CMD-SHELL",
          "node -e \"fetch('http://localhost:3403/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))\"",
        ],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(10),
      },
    });

    container.addPortMappings({ containerPort: 3403 });

    // Security group for Fargate tasks — needs access to Redis + internet (RPC calls)
    const fargateSecurityGroup = new ec2.SecurityGroup(this, "FargateSG", {
      vpc,
      description: "X402 Facilitator Fargate tasks",
      allowAllOutbound: true,
    });

    // Allow Fargate tasks to access Redis via the shared security group
    sharedSecurityGroup.addIngressRule(
      fargateSecurityGroup,
      ec2.Port.tcp(6379),
      "Allow x402 facilitator to access Redis"
    );

    const fargateService = new ecs.FargateService(this, "FargateService", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [fargateSecurityGroup, sharedSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // Grant DynamoDB access to the task role
    txHashesTable.grantReadWriteData(taskDefinition.taskRole);
    permitsTable.grantReadWriteData(taskDefinition.taskRole);
    statsTable.grantReadWriteData(taskDefinition.taskRole);

    // Grant Secrets Manager read access
    facilitatorSecret.grantRead(taskDefinition.taskRole);

    // ──────────────────────────────────────────────
    // ALB (internal, stable endpoint for API Gateway)
    // ──────────────────────────────────────────────
    const alb = new elbv2.ApplicationLoadBalancer(this, "ALB", {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const httpListener = alb.addListener("HttpListener", { port: 80 });

    httpListener.addTargets("FargateTarget", {
      port: 3403,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [fargateService],
      healthCheck: {
        path: "/health",
        interval: Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // ──────────────────────────────────────────────
    // API Gateway HTTP API (provides HTTPS endpoint)
    // ──────────────────────────────────────────────
    const httpApi = new apigwv2.CfnApi(this, "HttpApi", {
      name: `${serviceStage}-x402-facilitator`,
      protocolType: "HTTP",
    });

    const integration = new apigwv2.CfnIntegration(this, "HttpIntegration", {
      apiId: httpApi.ref,
      integrationType: "HTTP_PROXY",
      integrationUri: `http://${alb.loadBalancerDnsName}`,
      integrationMethod: "ANY",
      payloadFormatVersion: "1.0",
    });

    // eslint-disable-next-line no-new
    new apigwv2.CfnRoute(this, "DefaultRoute", {
      apiId: httpApi.ref,
      routeKey: "$default",
      target: `integrations/${integration.ref}`,
    });

    // eslint-disable-next-line no-new
    new apigwv2.CfnStage(this, "DefaultStage", {
      apiId: httpApi.ref,
      stageName: "$default",
      autoDeploy: true,
    });

    // ──────────────────────────────────────────────
    // Outputs
    // ──────────────────────────────────────────────
    new CfnOutput(this, "FacilitatorUrl", {
      value: `https://${httpApi.ref}.execute-api.${Fn.ref("AWS::Region")}.amazonaws.com`,
      description: "Facilitator HTTPS endpoint (API Gateway)",
    });

    new CfnOutput(this, "TxHashesTableName", {
      value: txHashesTable.tableName,
    });

    new CfnOutput(this, "PermitsTableName", {
      value: permitsTable.tableName,
    });

    new CfnOutput(this, "StatsTableName", {
      value: statsTable.tableName,
    });
  }
}
