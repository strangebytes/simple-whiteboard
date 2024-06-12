FROM node:latest

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY public ./public
COPY server.js ./
RUN mkdir ./whiteboards

EXPOSE 8081

CMD ["node", "server.js"]