import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';

export class BmoWooCommerceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a VPC
    const vpc = new ec2.Vpc(this, 'BMO-WooCommerce-VPC', {
      cidr: '10.0.0.0/16',
      natGateways: 1,
      maxAzs: 3,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          name: 'public-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 21,
        },
        {
          name: 'private-subnet-app',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 21,
        },
        {
          name: 'private-subnet-db',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 21,
        },
      ],
    });

    // Create a security group for the bastion host
    const bastionHostSecurityGroup = new ec2.SecurityGroup(this, 'BMOBastionHostSG', {
      vpc: vpc,
      securityGroupName: 'BMO-Bastion-Host-SG',
      description: 'Security group for BMOWooCommerce Bastion Host',
    });

    bastionHostSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH access');

    // Create the bastion host instance
    const bastionHost = new ec2.Instance(this, 'BMOBastionHost', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux({ generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 }),
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: bastionHostSecurityGroup,
      keyName: 'test2',
    });

    // Tag the bastion host instance
    cdk.Tags.of(bastionHost).add('Name', 'BMO-Bastion-Host');

    // Create security group for application servers
    const appServerSecurityGroup = new ec2.SecurityGroup(this, 'BMOWooCommerceServerSG', {
      vpc: vpc,
      securityGroupName: 'BMOWooCommerceServerSG',
      description: 'Security group for the BMOWooCommerce application servers',
    });

    // Add inbound rules for SSH and HTTP
    appServerSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP access');

    const appServerSecurityGroupMerged = new ec2.SecurityGroup(this, 'AppServerSecurityGroupMerged', {
      vpc: vpc,
      allowAllOutbound: true,
    });

    appServerSecurityGroupMerged.addIngressRule(bastionHostSecurityGroup, ec2.Port.allTraffic(), 'Allow all traffic from bastion host');
    appServerSecurityGroupMerged.addIngressRule(appServerSecurityGroup, ec2.Port.allTraffic(), 'Allow all traffic from application servers');

    // Create an IAM role with administrative permissions
    const adminRole = new iam.Role(this, 'AdminRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    // Define the initial setup user data
    const initialSetupUserData = ec2.UserData.forLinux();
    initialSetupUserData.addCommands(
      '#!/bin/bash',
      'set -e',
      'sudo yum update -y',
      'sudo amazon-linux-extras install mariadb10.5 -y',
      'sudo amazon-linux-extras install php8.2 -y',
      'sudo yum install -y httpd',
      'sudo systemctl start httpd',
      'sudo systemctl enable httpd',
      'sudo usermod -a -G apache ec2-user',
      // Start a new shell session to apply the group changes
      'exec bash',
      // Continue with the remaining commands
      'sudo chown -R ec2-user:apache /var/www',
      'sudo chmod 2775 /var/www && find /var/www -type d -exec sudo chmod 2775 {} \\;',
      'find /var/www -type f -exec sudo chmod 0664 {} \\;',
      'sudo yum install php-mbstring php-xml -y',
      'sudo systemctl restart httpd',
      'sudo systemctl restart php-fpm',
      'cd /var/www/html',
      'wget https://www.phpmyadmin.net/downloads/phpMyAdmin-latest-all-languages.tar.gz',
      'mkdir phpMyAdmin && tar -xvzf phpMyAdmin-latest-all-languages.tar.gz -C phpMyAdmin --strip-components 1',
      'rm phpMyAdmin-latest-all-languages.tar.gz',
      'echo "I am the server and i am load balancing properly as expected" > index.html',
      // Use cloud-init directive to request a reboot
      'cloud-init directive: reboot',
    );

    // Create Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'BMO-ALB', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // Create Security Group for ALB
    const albSecurityGroup = new ec2.SecurityGroup(this, 'BMO-ALB-SG', {
      vpc,
      securityGroupName: 'BMO-ALB-SG',
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow inbound HTTP traffic');

    // Create ALB Listener
    const listener = alb.addListener('BMO-Listener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.fixedResponse(200, {
        contentType: 'text/plain',
        messageBody: 'i am the application load balancer!',
      }),
    });

    // Tag ALB and Security Group
    cdk.Tags.of(alb).add('Name', 'BMO-ALB');
    cdk.Tags.of(albSecurityGroup).add('Name', 'BMO-ALB-SG');

    // Add outbound rule in the app server security group to allow traffic from ALB
    appServerSecurityGroupMerged.addEgressRule(albSecurityGroup, ec2.Port.tcp(80), 'Allow outbound HTTP traffic to ALB');

    // Add inbound rule in the ALB security group to allow traffic to the app server
    albSecurityGroup.addIngressRule(appServerSecurityGroupMerged, ec2.Port.tcp(80), 'Allow inbound HTTP traffic from app servers');

    // Create an Auto Scaling Group for application servers
    const appServerASG = new autoscaling.AutoScalingGroup(this, 'BMOWooCommerceAppServerASG', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux({ generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 }),
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroup: appServerSecurityGroupMerged,
      role: adminRole,
      minCapacity: 2,
      maxCapacity: 5,
      desiredCapacity: 2,
      keyName: 'test2',
    });

    // Create a security group for the RDS instance
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc,
      securityGroupName: 'BMOWooCommerceDBSG',
      description: 'Security group for the BMOWooCommerce RDS instance',
    });

    dbSecurityGroup.addIngressRule(appServerSecurityGroupMerged, ec2.Port.tcp(3306), 'Allow inbound MySQL traffic from application servers');

    // Create an RDS instance with Multi-AZ deployment
    const rdsInstance = new rds.DatabaseInstance(this, 'BMOWooCommerceDB', {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.MICRO),
      credentials: {
        username: 'admin',
        password: cdk.SecretValue.plainText('12345hello123'),
      },
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSecurityGroup],
      multiAz: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  };
};

