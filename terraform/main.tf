data "archive_file" "user_data" {
  type        = "zip"
  output_path = "${path.module}/../user-data/dist/user_data.zip" // change these paths to match your project
  source_dir  = "${path.module}/../user-data/dist/"     
}

resource "aws_lambda_function" "user_data" {
  depends_on = [ aws_dynamodb_table.user-data-table ] // this line will allow the dynamodb table to be created before the lambda function
  filename      = data.archive_file.user_data.output_path
  function_name = ""
  handler       = "index.handler"
  runtime       = "nodejs18.x" 
  timeout       = 15
  memory_size   = 256

  role             = "arn:aws:iam::381491885579:role/role-lambda-student"
  source_code_hash = data.archive_file.user_data.output_base64sha256

  environment {
      // specify env vars
      // you can reference the dynamodb table name here
  }
}