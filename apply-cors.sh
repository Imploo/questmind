#!/bin/bash

# Script to apply CORS configuration to Firebase Storage bucket
# This script requires the Google Cloud SDK (gcloud) to be installed and authenticated

BUCKET_NAME="questmind-dnd.firebasestorage.app"
CORS_FILE="cors.json"

echo "================================================"
echo "Firebase Storage CORS Configuration Script"
echo "================================================"
echo ""

# Check if cors.json exists
if [ ! -f "$CORS_FILE" ]; then
    echo "❌ Error: $CORS_FILE not found in current directory"
    exit 1
fi

echo "✓ Found $CORS_FILE"
echo ""

# Check if gsutil is installed
if ! command -v gsutil &> /dev/null; then
    echo "❌ Error: gsutil is not installed"
    echo ""
    echo "To install gsutil, you need the Google Cloud SDK:"
    echo "  - On macOS: brew install google-cloud-sdk"
    echo "  - On Linux: See https://cloud.google.com/sdk/docs/install"
    echo "  - On Windows: Download from https://cloud.google.com/sdk/docs/install"
    echo ""
    exit 1
fi

echo "✓ gsutil is installed"
echo ""

# Check if authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo "⚠️  You are not authenticated with Google Cloud"
    echo ""
    echo "Please run: gcloud auth login"
    echo ""
    exit 1
fi

ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n 1)
echo "✓ Authenticated as: $ACTIVE_ACCOUNT"
echo ""

# Display current CORS configuration
echo "Current CORS configuration for gs://$BUCKET_NAME:"
echo "------------------------------------------------"
gsutil cors get gs://$BUCKET_NAME 2>/dev/null || echo "No CORS configuration currently set"
echo ""

# Show what will be applied
echo "New CORS configuration to apply:"
echo "------------------------------------------------"
cat $CORS_FILE
echo ""
echo "------------------------------------------------"
echo ""

# Ask for confirmation
read -p "Do you want to apply this CORS configuration? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Operation cancelled"
    exit 0
fi

# Apply CORS configuration
echo ""
echo "Applying CORS configuration..."
if gsutil cors set $CORS_FILE gs://$BUCKET_NAME; then
    echo ""
    echo "✅ CORS configuration applied successfully!"
    echo ""
    echo "Verifying configuration..."
    gsutil cors get gs://$BUCKET_NAME
    echo ""
    echo "✅ Done! You can now access Firebase Storage from localhost:4200"
else
    echo ""
    echo "❌ Failed to apply CORS configuration"
    echo ""
    echo "Make sure you have the 'storage.buckets.update' permission on the bucket."
    echo "You may need to be a project owner or have the 'Storage Admin' role."
    exit 1
fi
