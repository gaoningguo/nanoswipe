# Stage 1: Build the Vue application
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy project files and build
COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration template
# Nginx official docker image automatically processes files in /etc/nginx/templates/ with envsubst
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Default environment variable for MoonTV API (can be overridden at runtime)
ENV MOONTV_URL="https://tv.gaoningguo.eu.org"

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
