#!/bin/bash
# scripts/setup.sh — Initial environment setup
set -e

echo "Setting up Supademo Integration v2.0..."

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js 18+ required"; exit 1; }
echo "✅ Node.js $(node -v)"

# Install dependencies
cd "$(dirname "$0")/../backend"
npm install
echo "✅ Dependencies installed"

# Create .env
if [ ! -f ../config/.env ]; then
  cp ../config/.env.example ../config/.env
  echo "✅ Created config/.env — edit with your API keys"
fi

echo ""
echo "Next steps:"
echo "  1. Edit config/.env with your API keys"
echo "  2. Run database migration: 002_supademo_integration.sql"
echo "  3. Test locally: cd backend && npm run dev"
echo "  4. Deploy: ./scripts/deploy.sh"
