FROM node:22-slim
WORKDIR /app
COPY . .
ENV PORT=3000 HOST=0.0.0.0 DB_PATH=/data/lab.db
VOLUME /data
EXPOSE 3000
CMD ["node","server.js"]
