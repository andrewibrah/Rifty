#!/bin/bash

# Edge Functions Deployment Script
# Deploy all new edge functions to Supabase

set -e

echo "🚀 Deploying Edge Functions to Supabase..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo -e "${GREEN}✓ Supabase CLI found${NC}"

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo -e "${YELLOW}⚠ Not logged in to Supabase${NC}"
    echo "Logging in..."
    supabase login
fi

echo -e "${GREEN}✓ Logged in to Supabase${NC}"
echo ""

# List of new edge functions to deploy
FUNCTIONS=(
    "get_operating_picture"
    "rag_search"
    "create_goal"
    "analyst_query"
    "goals_list_with_context"
    "update_goal"
    "create_entry_from_chat"
    "persist_user_facts"
    "summarize_entry"
    "detect_goal"
    "store_entry_summary"
    "generate_embedding"
    "store_entry_embedding"
    "embed_entry"
    "persist_personalization"
    "fetch_personalization_bundle"
    "delete_all_entries"
    "delete_entries_by_type"
    "create_user_fact"
    "update_user_fact"
    "delete_user_fact"
    "feedback_hook"
    "context_rebuilder"
    "failure_tracker"
    "main_chat_goal_recall"
    "link_reflections"
    "process_entry_mvp"
    "compute_goal_health"
)

echo "📦 Functions to deploy:"
for func in "${FUNCTIONS[@]}"; do
    echo "  - $func"
done
echo ""

# Prompt for confirmation
read -p "Deploy these functions? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

# Deploy each function
echo ""
echo "🔨 Deploying functions..."
echo ""

SUCCESS=0
FAILED=0

for func in "${FUNCTIONS[@]}"; do
    echo -e "${YELLOW}Deploying $func...${NC}"
    
    if supabase functions deploy "$func" --no-verify-jwt=false; then
        echo -e "${GREEN}✓ $func deployed successfully${NC}"
        ((SUCCESS++))
    else
        echo -e "${RED}✗ $func deployment failed${NC}"
        ((FAILED++))
    fi
    echo ""
done

# Summary
echo "========================================="
echo "📊 Deployment Summary"
echo "========================================="
echo -e "${GREEN}✓ Successful: $SUCCESS${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}✗ Failed: $FAILED${NC}"
fi
echo ""

# List deployed functions
echo "📋 Checking function status..."
supabase functions list

echo ""
echo "========================================="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All functions deployed successfully!${NC}"
else
    echo -e "${YELLOW}⚠ Some functions failed to deploy${NC}"
    echo "Check the logs above for errors"
fi
echo "========================================="

echo ""
echo "Next steps:"
echo "1. Verify secrets are set: supabase secrets list"
echo "2. Test functions: supabase functions logs <function-name>"
echo "3. Update frontend to use edge functions"
echo ""

