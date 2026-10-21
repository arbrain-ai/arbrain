#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
node --experimental-strip-types --test tests/live/*.test.ts
npm run typecheck
npm --prefix server test -- --run src/live/ src/chat-runtime/
npm --prefix server run typecheck
python3 -m unittest discover -s server/scripts/analytics/tests -p 'test_sales_reconcile.py'
if [ "${1:-}" = '--build' ]; then npm run build; fi
