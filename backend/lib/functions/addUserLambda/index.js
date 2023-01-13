/*global fetch*/

// bring in the aws-sdkv3
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
// bring in an adapter to help convert json to dynamodbJSON
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

// construct the dynamodb client
const client = new DynamoDBClient({})
// add the adapter to the dynamodb client
const ddbDocClient = DynamoDBDocumentClient.from(client)

export async function main(event) {
	// call the API
	const res = await fetch('https://randomuser.me/api/')
	const { results } = await res.json()
	const userInfo = results[0]

	//construct the params
	const params = {
		TableName: process.env.TABLENAME,
		Item: {
			userId: userInfo.login.uuid,
			firstname: userInfo.name.first,
			lastname: userInfo.name.last,
			picture: userInfo.picture.large,
		},
	}

	//try to add to the DB, otherwise throw an error
	try {
		await ddbDocClient.send(new PutCommand(params))
		return {
			body: 'success!',
		}
	} catch (err) {
		return {
			error: err,
		}
	}
}
