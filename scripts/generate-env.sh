#!/bin/bash

# Generate .env file from environment variables
# This script is called during deployment to create the .env file

cat > backend/.env << EOF
NODE_ENV=${NODE_ENV}
PORT=${PORT}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=${JWT_EXPIRES_IN}
PLAID_CLIENT_ID=${PLAID_CLIENT_ID}
PLAID_SECRET=${PLAID_SECRET}
PLAID_ENV=${PLAID_ENV}
PLAID_PRODUCTS=${PLAID_PRODUCTS}
PLAID_COUNTRY_CODES=${PLAID_COUNTRY_CODES}
DATA_DIR=${DATA_DIR}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
FRONTEND_URL=${FRONTEND_URL}
API_PREFIX=${API_PREFIX}
LOG_LEVEL=${LOG_LEVEL}
EOF

echo "✅ Generated backend/.env with $(wc -l < backend/.env) variables"