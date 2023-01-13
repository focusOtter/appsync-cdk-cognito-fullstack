const AWS = require('aws-sdk')
const docClient = new AWS.DynamoDB.DocumentClient()

async function main(event) {
	// call the API. Note that using the global fetch since this is a Nodev18
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
		await docClient.put(params).promise()
		return {
			body: 'success!',
		}
	} catch (err) {
		return {
			error: err,
		}
	}
}

module.exports = { main }
