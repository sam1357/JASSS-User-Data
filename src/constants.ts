import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { fromEnv } from "@aws-sdk/credential-providers";
import nodemailer from "nodemailer";

const client = new DynamoDBClient({
  region: "ap-southeast-2",
  credentials: fromEnv(),
});

export const docClient = DynamoDBDocumentClient.from(client);

// Add your user table name here from DynamoDB once created
// If you are using Terraform, you could look into changing this a process.env variable,
// and have Terraform pass it in as an environment variable once the table is created.
export const TABLE_NAME = "User Data Table";

// Fields that you will allow the user to edit after signing up
export const ADDITIONAL_USER_FIELDS = ["username"];

// Fields that you will allow the user to retrieve, but not all can be edited.
export const RETRIEVABLE_USER_FIELDS = ["username", "provider", "email", ...ADDITIONAL_USER_FIELDS];

// This is the email transport that will be used to send emails for resetting passwords
export const emailTransport = nodemailer.createTransport({
  service: "Gmail",
  host: "smtp.gmail.com",
  port: 465,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD,
  },
});
