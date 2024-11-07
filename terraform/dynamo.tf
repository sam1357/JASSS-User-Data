resource "aws_dynamodb_table" "user-data-table" {
  name           = "User Data Table"
  billing_mode   = "PROVISIONED"
  read_capacity  = 10
  write_capacity = 10
  hash_key       = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  // DynamoDB is a schema-less database, so attributes are added dynamically to the table as they are written
  // We are only defining the primary key here
}