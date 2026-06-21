#!/bin/bash
set -e

npm install --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
