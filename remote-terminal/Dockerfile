# docker buildx build --platform linux/amd64,linux/arm64 -t registry.rydersel.cloud/terminal . --push

FROM node:15.0.1-alpine3.12

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

CMD ["npm", "run", "dev"]

EXPOSE 3001



