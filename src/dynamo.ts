import bcrypt from "bcryptjs";
import * as EmailValidator from "email-validator";
import {
  ScanCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ErrorWithStatus } from "./types/errorWithStatus";
import {
  ADDITIONAL_USER_FIELDS,
  docClient,
  RETRIEVABLE_USER_FIELDS,
  TABLE_NAME,
} from "./constants";
import crypto, { randomUUID } from "crypto";
import { emailTransport } from "./constants";
import { logger } from ".";

/**
 * This function registers a user to the database and returns the user_id. The username must be
 * alphanumeric, and the username and email must both be unique.
 * @param table the table to write to in DynamoDB
 * @param username the username provided by the request
 * @param password the password provided by the request
 * @param email the email provided by the request
 * @returns new user ID
 */
export const registerUser = async (
  table: string,
  username: string,
  password: string,
  email: string
): Promise<string> => {
  validateTableName(table);

  // Validate Email and Username
  if (!EmailValidator.validate(email)) {
    throw new ErrorWithStatus("Invalid Email", 400);
  }

  // Check if email/username is not already taken
  const command = new ScanCommand({
    TableName: table,
  });

  const response = await docClient.send(command);
  if (response.Items !== undefined) {
    for (const item of response.Items) {
      // Check if email is taken
      if (item.email === email) {
        const str = `${item.provider ? ` Did you mean to sign in using ${item.provider}?` : ""}`;
        throw new ErrorWithStatus(`Email has been taken.${str}`, 409);
      }
    }
  }

  // Hash the provided password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Add the user to the database and return their ID
  return await databaseAddUser(table, username, email, hashedPassword);
};

/**
 * This function attempts to authenticate a user and returns the user_id if successful. Otherwise,
 * throws error.
 * @param table the table to read from in DynamoDB
 * @param email the email provided by the request
 * @param password the password provided by the request
 * @returns the userID if exists
 */
export const authenticateUser = async (
  table: string,
  email: string,
  password: string
): Promise<string> => {
  validateTableName(table);

  const command = new ScanCommand({
    TableName: table,
  });

  const response = await docClient.send(command);
  if (response.Items !== undefined) {
    for (const item of response.Items) {
      if (item.email === email) {
        if (item.provider) {
          throw new ErrorWithStatus(
            `You previously signed up using ${item.provider}. Please use that to sign in instead.`,
            403
          );
        }
        if (await bcrypt.compare(password, item.password_hash)) {
          // Returning the found user ID
          return item.user_id as string;
        }
      }
    }
  }

  // Unable to find user, throw error
  throw new ErrorWithStatus("Authentication Error (Incorrect email or password)", 401);
};

/**
 * This function handles an OAuth user. If they are present in the DB, the DB will return their ID.
 * If they are not present, the DB will create a new ID for them. Additionally, if they are trying
 * to authenticate with the wrong provider, an error will be returned.
 * @param table the table to read from in DynamoDB
 * @param username the username provided by the request
 * @param provider the provider provided by the request
 * @param email the provider provided by the request
 * @returns the userID if exists
 */
export const authenticateOauthUser = async (
  table: string,
  username: string,
  provider: string,
  email: string
): Promise<string> => {
  validateTableName(table);

  const command = new ScanCommand({
    TableName: table,
  });

  const response = await docClient.send(command);
  if (response.Items) {
    for (const item of response.Items) {
      if (item.email === email) {
        if (item.password_hash) {
          throw new ErrorWithStatus(
            "You signed up with a password. Please sign in with your password instead.",
            403
          );
        }
        if (item.provider === provider) {
          return item.user_id as string;
        } else {
          throw new ErrorWithStatus(
            `You first signed up via ${item.provider}. Please use that provider instead.`,
            403
          );
        }
      }
    }
  }

  return await databaseAddUser(table, username, email, undefined, provider);
};

/**
 * This function adds or modifies user info
 * @param table the table to write to in DynamoDB
 * @param user_id the user_id provided by the request
 * @param info an object containing the fields to set and their respective values
 * @returns nothing
 */
export const setUserInfo = async (
  table: string,
  user_id: string,
  info: { [field: string]: string }
) => {
  validateTableName(table);
  // Iterate over the key-value pairs for validation checks
  Object.entries(info).forEach(([field]) => {
    // Ensuring each field is from the specified set
    if (!ADDITIONAL_USER_FIELDS.includes(field.toLowerCase())) {
      throw new ErrorWithStatus(`User field '${field}' is invalid`, 400);
    }

    // ADD ADDITIONAL VALIDATION CHECKS HERE, IF NEEDED
  });

  // Check user_id and Update user in database if user_id exists
  try {
    await databaseEditUser(table, user_id, info);
  } catch (error: any) {
    // Falls in here if invalid user ID
    throw new ErrorWithStatus("User Id does not exist", 400);
  }
};

/**
 * This function gets a particular field of a user's info
 * @param table the table to read from in DynamoDB
 * @param user_id the user_id provided by the request
 * @param fields the fields provided by the request to get
 * @returns an object containing the fields and values
 */
export const getUserInfo = async (
  table: string,
  user_id: string,
  fields: string
): Promise<{ [field: string]: string }> => {
  validateTableName(table);

  // Ensuring each field is from the specified set
  const fieldsArray = fields.split(",").map((field) => field.trim());
  fieldsArray.forEach((field) => {
    if (!RETRIEVABLE_USER_FIELDS.includes(field.toLowerCase())) {
      throw new ErrorWithStatus(`User field '${field}' is invalid`, 400);
    }
  });

  // Construct and send the command that requests the fields
  const command = new GetCommand({
    TableName: table,
    Key: {
      "user_id": user_id,
    },
    ProjectionExpression: fields,
  });
  const response = await docClient.send(command);

  if (response.Item === undefined) {
    throw new ErrorWithStatus("Invalid User Id", 400);
  } else if (JSON.stringify(response.Item) === "{}") {
    throw new ErrorWithStatus(`Uninitialised value/s: '${fields}'`, 400);
  } else {
    return response.Item;
  }
};

/**
 * This function changes a user's password
 * @param table the table to read from/write to in DynamoDB
 * @param email the email of the user to change the password of
 * @param oldPassword the user's old password
 * @param newPassword the user's new password
 * @returns nothing
 */
export const changePassword = async (
  table: string,
  email: string,
  oldPassword: string,
  newPassword: string
) => {
  // (1) Validate table name
  validateTableName(table);

  // (2) Check that newPassword is not the same as oldPassword
  if (oldPassword === newPassword) {
    throw new ErrorWithStatus("New password cannot be the same as your old password", 400);
  }
  // (3) Re-authenticate the User
  let userId: string;
  try {
    userId = await authenticateUser(table, email, oldPassword);
  } catch (err: any) {
    if (err.statusCode === 403) {
      throw new ErrorWithStatus(
        "You cannot change your password as you signed in with a third-party provider.",
        403
      );
    } else {
      throw err;
    }
  }

  // Create a new hash
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Change the password
  await databaseEditUser(table, userId, { "password_hash": hashedPassword });
};

/**
 * This function delete's a user from the database
 * @param table the table to delete from in DynamoDB
 * @param userID the userID of the user to delete
 * @returns nothing
 */
export const deleteUser = async (table: string, userId: string) => {
  validateTableName(table);

  // Delete command to the AWS SDK
  const command = new DeleteCommand({
    TableName: table,
    Key: {
      user_id: userId,
    },
    ConditionExpression: "attribute_exists(user_id)",
  });

  try {
    await docClient.send(command);
  } catch (e) {
    throw new ErrorWithStatus("User Id does not exist", 400);
  }
};

/**
 * This function sends a password reset token to a user's email
 * @param table the table to delete from in DynamoDB
 * @param email the email of the user who wants to reset their password
 * @returns the token (for debugging purposes)
 */
export const sendPasswordResetToken = async (table: string, email: string): Promise<string> => {
  // (1) Validate Table name
  validateTableName(table);

  // (2) Validate email
  if (!EmailValidator.validate(email)) {
    throw new ErrorWithStatus("Email does not exist", 400);
  }

  // (2) Get id of matching user
  const command = new ScanCommand({
    TableName: table,
  });

  let userId = "";
  const response = await docClient.send(command);
  if (response.Items !== undefined) {
    for (const item of response.Items) {
      if (item.email === email) {
        if (item.provider) {
          throw new ErrorWithStatus(
            // eslint-disable-next-line
            `You previously signed up using ${item.provider}, so you do not have a password to reset.`,
            403
          );
        }
        userId = item.user_id as string;
        break;
      }
    }
  }

  if (userId === "") {
    throw new ErrorWithStatus("Email does not exist", 400);
  }

  // (3) Generate Token and Expiry Date (1 hour in future)
  const token = crypto.randomBytes(10).toString("hex");
  const hashedToken = await bcrypt.hash(token, 10);

  const now = new Date();
  now.setHours(now.getHours() + 1);
  const expiryStr = now.toISOString();

  // (4) Write token and expiry to database
  await databaseEditUser(table, userId, { "resetToken": hashedToken, "tokenExpiry": expiryStr });

  // (5) Send email with token
  await sendTokenEmail(email, token);

  return token;
};

/**
 * This function takes in a password reset token and changes the password
 * @param table the table to delete from in DynamoDB
 * @param email the email of the user who wants to reset their password
 * @param token the password reset token the user has obtained
 * @param newPassword the user's new password
 * @returns the token (for debugging purposes)
 */
export const resetPassword = async (
  table: string,
  email: string,
  token: string,
  newPassword: string
) => {
  // (1) Validate Table Name
  validateTableName(table);

  // (2) Validate email
  if (!EmailValidator.validate(email)) {
    throw new ErrorWithStatus("Email does not exist", 400);
  }

  // (2) Check that email exists, token exists, AND token not expired
  const command = new ScanCommand({
    TableName: table,
  });

  let userId = "";
  const response = await docClient.send(command);
  if (response.Items !== undefined) {
    for (const item of response.Items) {
      if (item.email === email) {
        // Check if user is registered with OAuth
        if (item.provider) {
          throw new ErrorWithStatus(
            // eslint-disable-next-line
            `You previously signed up using ${item.provider}, so you do not have a password to reset.`,
            403
          );
        }

        // Check if new password same as original password
        if (await bcrypt.compare(newPassword, item.password_hash)) {
          throw new ErrorWithStatus("New password cannot be the same as your old password", 400);
        }
        // Check if no token exists
        if (
          item.resetToken === undefined ||
          item.tokenExpiry === undefined ||
          item.resetToken === "" ||
          item.tokenExpiry === ""
        ) {
          throw new ErrorWithStatus("Invalid Token", 400);
        }

        // Check if existing token has expired
        const now = new Date();
        const expiry = new Date(item.tokenExpiry);
        if (now >= expiry) {
          await databaseEditUser(table, item.user_id, { "resetToken": "", "tokenExpiry": "" });
          throw new ErrorWithStatus("Invalid Token", 400);
        }

        // Check if token matches
        if (!(await bcrypt.compare(token, item.resetToken))) {
          throw new ErrorWithStatus("Invalid Token", 400);
        }

        userId = item.user_id as string;
        break;
      }
    }
  }

  if (userId === "") {
    throw new ErrorWithStatus("Email does not exist", 400);
  }

  // (3) Change Password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await databaseEditUser(table, userId, {
    "resetToken": "",
    "tokenExpiry": "",
    "password_hash": hashedPassword,
  });

  // (4) Send email that Password has changed
  await sendPasswordResetEmail(email);
};

// HELPERS

/**
 * This function delete's a user from the database
 * @param table the name of a table
 * @returns nothing, throws error if invalid table name
 */
export function validateTableName(table: string) {
  if (table !== TABLE_NAME) {
    throw new ErrorWithStatus("Invalid Table Name", 400);
  }
}

/**
 * This function adds a user to a specified DynamoDB table
 * @param table the name of a table
 * @param username the username of the new row
 * @param passwordHash the hashed password of the new row
 * @param email the email of the new row
 * @returns user_id of new user
 */
export const databaseAddUser = async (
  table: string,
  username: string,
  email: string,
  passwordHash?: string,
  provider?: string
): Promise<string> => {
  const newIdVal = randomUUID() as string;
  const command = new PutCommand({
    TableName: table,
    Item: {
      user_id: newIdVal,
      username: username,
      password_hash: passwordHash,
      provider: provider,
      email: email,
    },
  });
  await docClient.send(command);
  return newIdVal;
};

/**
 * This function modifies an existing user in the Dynamo DB table
 * @param table the name of a table
 * @param userID the user_id of the user to modify
 * @param infoValues the fields to change and their respective values
 * @returns nothing
 */
export const databaseEditUser = async (
  table: string,
  userID: string,
  infoValues: { [key: string]: string }
) => {
  const updateExpressionParts = Object.keys(infoValues)
    .map((infoName) => `${infoName} = :${infoName}`)
    .join(", ");

  const expressionAttributeValues = Object.entries(infoValues).reduce(
    (acc, [infoName, infoValue]) => ({
      ...acc,
      [`:${infoName}`]: infoValue,
    }),
    {}
  );

  const command = new UpdateCommand({
    TableName: table,
    Key: {
      user_id: userID,
    },
    UpdateExpression: `set ${updateExpressionParts}`,
    ConditionExpression: "attribute_exists(user_id)",
    ExpressionAttributeValues: expressionAttributeValues,
  });

  try {
    await docClient.send(command);
  } catch (e) {
    throw new ErrorWithStatus("User Id does not exist", 400);
  }
};

/**
 * This function sends an email containing the password reset token
 * @param email the email of the user who wants to reset their password
 * @param token the password reset token
 */
export const sendTokenEmail = async (email: string, token: string) => {
  // FEEL FREE TO CHANGE THIS EMAIL TEMPLATE
  const textStyle = `text-align: center; font-family: Arial, Helvetica, sans-serif; width: 50%; 
  font-weight: bold;`;
  const htmlContents: string = `
    <div align="center">
      <h2 style="${textStyle} font-size: x-large;">Here is Your Password Reset Token</h2>
      <p style="${textStyle} font-size: larger;">
        ${token}
      </p>
      <p style="${textStyle} font-size: medium;">
        Please copy this token into your application to reset your password. If you didn't request a
        password reset, you can safely ignore this email.
      </p>
    </div>`;

  const message = {
    from: process.env.MAIL_USERNAME,
    to: email,
    subject: "Password Reset Request 🔑",
    html: htmlContents,
  };

  try {
    await emailTransport.sendMail(message);
  } catch (err: any) {
    logger.error(err);
    throw new ErrorWithStatus("Email failed to send", 500);
  }
};

/**
 * This function sends an email notifying a user that their password has been reset
 * @param email the email for the user whose password has been reset
 */
export const sendPasswordResetEmail = async (email: string) => {
  // FEEL FREE TO CHANGE THIS EMAIL TEMPLATE
  const textStyle = `text-align: center; font-family: Arial, Helvetica, sans-serif; width: 50%; 
  font-weight: bold;`;
  const htmlContents: string = `
    <div align="center">
      <h2 style="${textStyle} font-size: x-large;">Your Password Has Been Reset</h2>
      <p style="${textStyle} font-size: larger;">
        You may now login with your new password.
      </p>
    </div>`;

  const message = {
    from: process.env.MAIL_USERNAME,
    to: email,
    subject: "Password Reset Confirmation 🔑",
    html: htmlContents,
  };

  try {
    await emailTransport.sendMail(message);
  } catch (err: any) {
    logger.error(err);
    throw new ErrorWithStatus("Email failed to send", 500);
  }
};
