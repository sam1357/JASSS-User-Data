<div align="center">
  <img src="logo.png" alt="Solarvoyant Logo" width="100" height="100">
</div>

# JASSS User-Data API

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Terraform](https://img.shields.io/badge/terraform-%235835CC.svg?style=for-the-badge&logo=terraform&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-%23FF9900.svg?style=for-the-badge&logo=amazon-aws&logoColor=white)

This is our user data API which is designed to store any data relating to a user. It allows for the
secure storage for a user's passwords, and also allows for the storage of information pertaining to users
who signed up with OAuth Providers, such as Google.

> [!IMPORTANT]  
> Do note that this API does not handle token storage or creation. This should be handled via another library or an AWS service.

The API is customizable to allow for any team to adapt to store their own data.

## Contact

Contact solarvoyant@gmail.com or `samiam#1` on Discord for assistance!

## Features

- Securely stores and manages user data, including username, email and password
- Allows users to sign in via an email and password
- Handles allowing users to sign up/sign in with an OAuth Provider
- Allows for the storage and editing of additional details pertaining to a user
- Allows for a user to change their password
- Allows for users to change their password through an email reset system via tokens
- Tokens and passwords are stored securely as hashes
- All data is stored as a DynamoDB table
- API is deployed as a serverless lambda function, but has its own API routes and is callable like an API for ease of use.

## Routes

| Route             | HTTP Method | Description                                          | Parameters                                                                                                                                                               | Return Information                                                                                                                                                                                                                                                                              |
| ----------------- | ----------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/register`       | `POST`      | Registers a new user                                 | **Location**: `Body`<br>`username`, `password`, `email`                                                                                                                  | - **400**: Bad inputs<br>- **409**: Another user with the same email has signed up with a different provider<br>- **500**: Internal server error<br>- **200**: Success, returns id, username, and email as an object                                                                            |
| `/authenticate`   | `POST`      | Authenticates user credentials                       | **Location**: `Body`<br>`email`, `password`                                                                                                                              | - **400**: Bad inputs<br>- **401**: Incorrect credentials or username<br>- **403**: User with the same email has signed in with the wrong provider<br>- **500**: Internal server error<br>- **200**: Success, returns id, username, and email as an object                                      |
| `/handle-oauth`   | `POST`      | Handles OAuth authentication, including registration | **Location**: `Body`<br>`email`, `provider`, `username`                                                                                                                  | - **400**: Bad inputs<br>- **403**: User with the same email has already signed up with a password, or a different provider<br>- **500**: Internal server error<br>- **200**: Success, returns id, username, email, and provider as an object                                                   |
| `/set`            | `PATCH`     | Updates user information                             | **Location**: `Body`<br>`userID`, `info`<br>Keys correspond to the field to set, and values correspond to the value to set. For example: `{"info": {"username": "abc"}}` | - **400**: Bad inputs<br>- **500**: Internal server error<br>- **200**: Success, returns a message within an object                                                                                                                                                                             |
| `/get`            | `GET`       | Retrieves user information                           | **Location**: `Body`<br>`userID`, `fields`<br>Keys correspond to the fields to return, as a comma-separated list. For example: `fields: "username, address"`             | - **400**: Bad inputs<br>- **500**: Internal server error<br>- **200**: Success, returns the requested fields as an object nested under the "fields" key                                                                                                                                        |
| `/change-pw`      | `PATCH`     | Changes user password                                | **Location**: `Body`<br>`email`, `oldPassword`, `newPassword`                                                                                                            | - **400**: Bad inputs<br>- **401**: Incorrect credentials or username<br>- **403**: Can't change password because the user with the same email has signed up/signed in using a third-party provider<br>- **500**: Internal server error<br>- **200**: Success, returns an object with a message |
| `/delete`         | `DELETE`    | Deletes user account                                 | **Location**: `Body`<br>`userID`                                                                                                                                         | - **400**: Bad inputs<br>- **500**: Internal server error<br>- **200**: Success, returns an object with a message                                                                                                                                                                               |
| `/pw-reset-token` | `POST`      | Sends password reset token to user email             | **Location**: `Body`<br>`email`                                                                                                                                          | - **400**: Bad inputs<br>- **500**: Internal server error<br>- **200**: Returns an object with a message. Note: Does not return the token for security. Token is sent only to the provided email.                                                                                               |
| `/pw-reset`       | `PATCH`     | Resets user password using token sent to email       | **Location**: `Body`<br>`email`, `token`, `newPassword`                                                                                                                  | - **400**: Bad inputs<br>- **500**: Internal server error<br>- **200**: Success, returns an object with a message. User also receives a notification email                                                                                                                                      |
|                   |

## Env Variables

Below are a list of the env variables that you will need to fill out if you wish to execute (as tests) or deploy the microservice from a local instance.
Otherwise, these env variables should be handled within your deployment pipelines. Adjust them accordingly as needed

- `EXEC_AWS_ACCESS_KEY_ID` - AWS Access Key IDs
- `EXEC_AWS_SECRET_ACCESS_KEY` - AWS Access Key ID Secret
- `POWERTOOLS_SERVICE_NAME` - We are using a library to handle the logging
- `MAIL_USERNAME` - The username (email) to the email account that you wish to send emails from for password reset
- `MAIL_PASSWORD` - The password to the email account that you wish to send emails from for password reset

## Deployment and Setting Up

- Duplicate the `.env.template` as `.env` and fill out the env variables. See above section for more details.
- Run `npm i` to install the modules.
- Modify the constants in `src/constants.ts` as necessary.
- To build the package, run `npm run build`. This will create a /dist folder within the root directory.
- Change your Terraform config as necessary. You may also decide to either create the DynamoDB table manually, or via Terraform. There are templates that you can adapt in the `terraform` folder.

> [!NOTE]  
> There is also an email template that sits within `dynamo.ts` that you should edit to fit your needs.
