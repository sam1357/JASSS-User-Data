import { Logger } from "@aws-lambda-powertools/logger";
import { APIGatewayProxyResult, LambdaFunctionURLEvent } from "aws-lambda";
import {
  handleAuthenticate,
  handleChangePW,
  handleDeleteUser,
  handleGetInfo,
  handleOauth,
  handleRegister,
  handleResetPassword,
  handleSendPasswordResetToken,
  handleSetInfo,
} from "./endpoints";

export const logger = new Logger();
export const headers = { "Content-Type": "application/json" };

/**
 * Handler for all the requests made to the user data API
 * @param event all of the info provided by Lambda about the enent
 * @returns the HTTP response
 */
export async function handler(event: LambdaFunctionURLEvent): Promise<APIGatewayProxyResult> {
  let httpMethod: string;
  let path: string;

  // to allow for an invoke from aws-sdk lambda client library, rather than from URL.
  if (Object.keys(event).includes("httpMethod") && Object.keys(event).includes("path")) {
    httpMethod = (event as any).httpMethod;
    path = (event as any).path;
  } else {
    // request from direct lambda URL
    httpMethod = event.requestContext.http.method;
    path = event.requestContext.http.path;
  }

  logger.info(
    `Received event, processing data. path: ${path ?? ""}, httpMethod: ${httpMethod ?? ""},
    body: ${JSON.stringify(event.body) ?? ""}`
  );

  // Ensuring the path is provided
  if (!path) {
    logger.error("Path was not provided to the handler.");
    return {
      headers,
      statusCode: 400,
      body: JSON.stringify({ message: "No path provided" }),
    };
  }

  // Ensuring the httpMethod is provided
  if (!httpMethod) {
    logger.error("httpMethod was not provided to the handler.");
    return {
      headers,
      statusCode: 405,
      body: JSON.stringify({ message: "No httpMethod provided" }),
    };
  }

  if (httpMethod === "POST" && isCorrectPath(path, "register")) {
    return handleRegister(event);
  }

  if (httpMethod === "POST" && isCorrectPath(path, "authenticate")) {
    return handleAuthenticate(event);
  }

  if (httpMethod === "POST" && isCorrectPath(path, "handle-oauth")) {
    return handleOauth(event);
  }

  if (httpMethod === "PATCH" && isCorrectPath(path, "set")) {
    return handleSetInfo(event);
  }

  if (httpMethod === "GET" && isCorrectPath(path, "get")) {
    return handleGetInfo(event);
  }

  if (httpMethod === "PATCH" && isCorrectPath(path, "change-pw")) {
    return handleChangePW(event);
  }

  if (httpMethod === "DELETE" && isCorrectPath(path, "delete")) {
    return handleDeleteUser(event);
  }

  if (httpMethod === "POST" && isCorrectPath(path, "pw-reset-token")) {
    return handleSendPasswordResetToken(event);
  }

  if (httpMethod === "PATCH" && isCorrectPath(path, "pw-reset")) {
    return handleResetPassword(event);
  }

  // Catch all for random httpMethod and path combinations
  return {
    statusCode: 404,
    body: JSON.stringify({ message: "Unrecognised path and method combination" }),
  };
}

/**
 * Handler for all the requests made to the user data API
 * @param path the path provided by the user
 * @param correctPath the ideal path to test against
 * @returns boolean of whether or not the regex matches
 */
function isCorrectPath(path: string, correctPath: string): boolean {
  return new RegExp(`^(/(dev|staging|prod))?/user-data/${correctPath}$`).test(path);
}
