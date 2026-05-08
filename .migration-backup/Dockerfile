# Use Node 22 as the base to satisfy modern dependencies (Scalar, Orval, etc)
FROM node:22-slim

# Set working directory
WORKDIR /app

# Install system dependencies (for sharp, etc)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/
COPY lib/integrations-anthropic-ai/package.json ./lib/integrations-anthropic-ai/
COPY lib/supabase/package.json ./lib/supabase/

# Install dependencies
RUN npm install --include=dev

# Copy all files
COPY . .

# Set environment to production
ENV NODE_ENV=production

# Run the build (Vite + libraries)
RUN npm run build

# Hugging Face Spaces expect port 7860
EXPOSE 7860
ENV PORT=7860

# Start the application
# In production, we run the API server which serves the built frontend
CMD ["npx", "tsx", "api/index.ts"]
