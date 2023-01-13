/*global fetch*/
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
const client = new DynamoDBClient({})

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
		const ddbDocClient = DynamoDBDocumentClient.from(client)
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
