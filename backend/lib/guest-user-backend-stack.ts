import {
	CfnOutput,
	Duration,
	RemovalPolicy,
	Stack,
	StackProps,
} from 'aws-cdk-lib'
import {
	AccountRecovery,
	UserPool,
	UserPoolClient,
	VerificationEmailStyle,
} from 'aws-cdk-lib/aws-cognito'

import {
	IdentityPool,
	UserPoolAuthenticationProvider,
} from '@aws-cdk/aws-cognito-identitypool-alpha'
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb'
import {
	AppsyncFunction,
	AuthorizationType,
	Code as AppSyncCode,
	FieldLogLevel,
	FunctionRuntime,
	GraphqlApi,
	Resolver,
	SchemaFile,
} from 'aws-cdk-lib/aws-appsync'
import { Construct } from 'constructs'

import * as path from 'path'
import { Schedule, Rule } from 'aws-cdk-lib/aws-events'
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets'
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda'

export class GuestUserStack extends Stack {
	constructor(scope: Construct, id: string, props?: StackProps) {
		super(scope, id, props)

		// create the user pool
		const userPool = new UserPool(this, 'UserDemoPool', {
			selfSignUpEnabled: true,
			accountRecovery: AccountRecovery.PHONE_AND_EMAIL,
			userVerification: {
				emailStyle: VerificationEmailStyle.CODE,
			},
			autoVerify: {
				email: true,
			},
			standardAttributes: {
				email: {
					required: true,
					mutable: true,
				},
			},
		})

		// create the user pool client for the frontend
		const userPoolClient = new UserPoolClient(this, 'UserListPoolClient', {
			userPool,
		})

		// create the identity pool
		const identityPool = new IdentityPool(this, 'IdentityDemoPool', {
			identityPoolName: 'identityDemoForUserData',
			allowUnauthenticatedIdentities: true,
			authenticationProviders: {
				userPools: [
					new UserPoolAuthenticationProvider({ userPool, userPoolClient }),
				],
			},
		})

		// create the dynamodb table
		const userTable = new Table(this, 'UsersAPITable', {
			removalPolicy: RemovalPolicy.DESTROY,
			billingMode: BillingMode.PAY_PER_REQUEST,
			partitionKey: { name: 'userId', type: AttributeType.STRING },
		})

		const api = new GraphqlApi(this, 'UsersAPI', {
			name: 'UsersAPI',
			schema: SchemaFile.fromAsset(path.join(__dirname, 'schema.graphql')),
			authorizationConfig: {
				defaultAuthorization: {
					authorizationType: AuthorizationType.USER_POOL,
					userPoolConfig: {
						userPool,
					},
				},
				additionalAuthorizationModes: [
					{
						authorizationType: AuthorizationType.IAM,
					},
				],
			},
			logConfig: {
				fieldLogLevel: FieldLogLevel.ALL,
			},
			xrayEnabled: true,
		})

		// allow unauthenticated access to the `listUsers` query
		api.grantQuery(identityPool.unauthenticatedRole, 'listUsers')

		// Create the AppSync function
		const listUsersFunction = new AppsyncFunction(this, 'listUsersFunction', {
			name: 'listUsersFunction',
			api,
			dataSource: api.addDynamoDbDataSource('listUsers', userTable),
			code: AppSyncCode.fromAsset(
				path.join(__dirname, 'mappings/Query.listUsers.js')
			),
			runtime: FunctionRuntime.JS_1_0_0,
		})

		//Create the pipeline
		new Resolver(this, 'PipelineResolver', {
			api,
			typeName: 'Query',
			fieldName: 'listUsers',
			code: AppSyncCode.fromInline(`
    // The before step (no before steps)
    export function request() {
      return {}
    }

    // The after step (simply return the result)
    export function response(ctx) {
      return ctx.prev.result
    }
  `),
			runtime: FunctionRuntime.JS_1_0_0,
			pipelineConfig: [listUsersFunction],
		})

		// create a lambda
		const addUserLambda = new Function(this, 'addUserFunction', {
			runtime: Runtime.NODEJS_18_X,
			handler: 'index.main',
			code: Code.fromAsset(path.join(__dirname, 'functions/addUserLambda')),
			environment: {
				TABLENAME: userTable.tableName,
			},
		})

		// give the lambda permission to write to DynamoDB
		userTable.grantWriteData(addUserLambda)

		//Create a schedule so that the Lambda gets triggered every 5 minutes
		new Rule(this, 'addUserRule', {
			schedule: Schedule.rate(Duration.minutes(5)),
			targets: [new LambdaFunction(addUserLambda)],
		})

		// output these variables. The frontend needs some of these. See deploy script in package.json
		new CfnOutput(this, 'UserPoolId', {
			value: userPool.userPoolId,
		})

		new CfnOutput(this, 'UserPoolClientId', {
			value: userPoolClient.userPoolClientId,
		})

		new CfnOutput(this, 'IdentityPoolId', {
			value: identityPool.identityPoolId,
		})

		new CfnOutput(this, 'GraphQLAPIID', {
			value: api.apiId,
		})

		new CfnOutput(this, 'GraphQLURL', {
			value: api.graphqlUrl,
		})
	}
}
