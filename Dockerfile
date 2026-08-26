FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose Web Dashboard Port (Hugging Face default 7860, or 3000)
ENV PORT=7860
EXPOSE 7860

# Start Application
CMD ["npm", "run", "start"]
